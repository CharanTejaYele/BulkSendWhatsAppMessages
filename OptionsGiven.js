const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");
const readline = require("readline");
const { getMessage, getImage } = require("./Message");

const MAX_CLIENTS = 1;
const CHUNK_SIZE = 20;
const DELAY_BETWEEN_MESSAGES = 2000; // 2 seconds
const MEMORY_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

const contacts = [];
let sent = 0;
let clients = [];
let sendType = "";

// Initialize readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
let messageText = "";

// Main CLI Menu
const selectOption = () => {
  rl.question(
    "Select an option: \n1. Send Message Without Media\n2. Send Message With Media\n3. Select Message from Chat\nYour choice: ",
    (option) => {
      if (option === "1") {
        sendType = "MessageFromJSFileWithoutMedia";
        messageText = getMessage();
      } else if (option === "2") {
        sendType = "MessageFromJSFileWithMedia";
        messageText = getMessage();
      } else if (option === "3") {
        sendType = "selectMessageFromChat";
        messageText = createMessageFromChat()
      } else {
        console.log("Invalid option. Exiting.");
        rl.close();
        return;
      }

      console.log(`You chose: ${sendType}`);
      rl.close(); // Close the CLI prompt after the selection
    }
  );
};

// Parse the CSV file to extract contacts
const parseCSVAndInitializeClients = () => {
  fs.createReadStream("contacts.csv")
    .pipe(csv())
    .on("data", (row) => {
      contacts.push({
        name: row["First Name"],
        last: row["Last Name"],
        phone: row["Phone 1 - Value"],
      });
    })
    .on("end", () => {
      console.log("CSV file successfully processed.");

      // Split contacts into chunks of CHUNK_SIZE
      const contactChunks = [];
      for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
        contactChunks.push(contacts.slice(i, i + CHUNK_SIZE));
      }

      // Initialize clients and start processing
      initializeClients(contactChunks);
    });
};

// Function to initialize clients
const initializeClients = async (contactChunks) => {
  for (let i = 0; i < Math.min(MAX_CLIENTS, contactChunks.length); i++) {
    const client = await createClient(i + 1);
    clients.push({ client, id: i + 1, busy: false });
  }

  console.log("All clients are ready. Starting to assign tasks...");

  assignTasksParallel(contactChunks);

  // Start periodic memory cleanup
  setInterval(cleanupMemory, MEMORY_CLEANUP_INTERVAL);
};

// Function to create a single client
const createClient = (clientId) => {
  return new Promise((resolve) => {
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: `whatsapp-client-${clientId}` }),
      puppeteer: { headless: true },
    });

    client.on("qr", (qr) => {
      qrcode.generate(qr, { small: true });
      console.log(
        `QR code for client ${clientId} generated. Please scan to authenticate.`
      );
    });

    client.on("ready", () => {
      console.log(`Client ${clientId} is ready!`);
      resolve(client);
    });

    client.initialize();
  });
};

// Function to assign tasks to clients in parallel
const assignTasksParallel = (contactChunks) => {
  let pendingChunks = [...contactChunks];

    // Start the process by showing the menu
    selectOption();

  const processNextChunk = (clientId) => {
    if (pendingChunks.length === 0) {
      console.log(`Client ${clientId}: No more tasks to assign.`);
      return;
    }

    const chunk = pendingChunks.shift();
    const client = clients.find((c) => c.id === clientId);

    if (client) {
      client.busy = true;
      console.log(
        `Assigning a new chunk to client ${clientId}. Remaining chunks: ${pendingChunks.length}`
      );

      sendMessagesSequentially(client.client, chunk, clientId, () => {
        client.busy = false;
        processNextChunk(clientId); // Reassign a new task when done
      });
    }
  };

  clients.forEach((client) => {
    processNextChunk(client.id);
  });
};

// Function to send messages sequentially
const sendMessagesSequentially = (client, contacts, clientId, onComplete) => {
  if (contacts.length === 0) {
    console.log(`No contacts to send messages to for client ${clientId}.`);
    onComplete();
    return;
  }

  const sendMessageToContact = (index) => {
    if (index >= contacts.length) {
      console.log(`Client ${clientId}: All messages sent for this batch.`);

      // Restart the client after completing the chunk
      restartClient(clientId, () => {
        onComplete();
      });

      return;
    }

    const contact = contacts[index];
    const phoneNumber = contact.phone;
    const chatId = `${phoneNumber}@c.us`;

    // Select message based on sendType
    let messageObj;
    if (sendType === "MessageFromJSFileWithoutMedia") {
      messageObj = createMessageWithoutMedia(contact, chatId);
      console.log(messageObj);
    } else if (sendType === "MessageFromJSFileWithMedia") {
      messageObj = createMessageWithMedia(contact, chatId);
    } else if (sendType === "selectMessageFromChat") {
      messageObj = createMessageFromChat(contact, chatId);
    }

    client
      .sendMessage(...Object.values(messageObj))
      .then(() => {
        sent++;
        console.log(
          `Client ${clientId}: Message sent to ${contact.name} ${contact.last}. Total sent: ${sent}`
        );
        setTimeout(
          () => sendMessageToContact(index + 1),
          DELAY_BETWEEN_MESSAGES
        );
      })
      .catch((error) => {
        console.log(
          `Client ${clientId}: Failed to send message to ${contact.name} ${contact.last}:`,
          error
        );
        setTimeout(
          () => sendMessageToContact(index + 1),
          DELAY_BETWEEN_MESSAGES
        );
      });
  };

  sendMessageToContact(0); // Start with the first contact
};

// Function to create a message without media (Option 1)
const createMessageWithoutMedia = (contact, chatId) => {
  return { chatId, messageText };
};

// Function to create a message with media (Option 2)
const createMessageWithMedia = (contact, chatId) => {
  const imagePath = getImage();
  const media = new MessageMedia(
    "image/png",
    fs.readFileSync(imagePath).toString("base64"),
    "image.png"
  );
  return { chatId, media, options: { caption: messageText } };
};

// Function to create a message from existing chat (Option 3)
const createMessageFromChat = async (contact, chatId) => {
  const message = await getLastMessageFromChat();
  return { chatId, message, options: {} };
};


// Function to restart a client
const restartClient = async (clientId, callback) => {
  const clientObj = clients.find((c) => c.id === clientId);

  if (!clientObj) {
    console.error(`Client ${clientId} not found for restart.`);
    return;
  }

  console.log(`Restarting client ${clientId}...`);

  try {
    await clientObj.client.destroy(); // Destroy the client
    const newClient = await createClient(clientId); // Reinitialize the client
    clientObj.client = newClient; // Replace the old client instance
    console.log(`Client ${clientId} restarted successfully.`);
    if (callback) callback(); // Notify that the restart is complete
  } catch (error) {
    console.error(`Failed to restart client ${clientId}:`, error);
    if (callback) callback();
  }
};

// Function to clean up memory
const cleanupMemory = () => {
  clients.forEach(async ({ client, id }) => {
    if (!client.puppeteer) return;

    const browser = await client.puppeteer.getBrowser();
    const pages = await browser.pages();

    for (const page of pages) {
      await page.evaluate(() => {
        // Clear session storage and local storage
        sessionStorage.clear();
        localStorage.clear();
      });
    }

    // Clear cookies and cache
    const clientCookies = await browser.defaultBrowserContext().cookies();
    for (const cookie of clientCookies) {
      await browser.defaultBrowserContext().clearPermissionOverrides(cookie);
    }

    console.log(`Client ${id}: Memory cleanup completed.`);
  });
};

parseCSVAndInitializeClients(); // Proceed with CSV parsing and client initialization
