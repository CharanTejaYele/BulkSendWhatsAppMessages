const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");
const readline = require("readline");
const {
  createMessageWithoutMedia,
  createMessageWithMedia,
  createMessageFromChat,
} = require("./Functions/CreateMessageFunctions");
const { formatPhoneNumber } = require("./Functions/PhoneNumberModifier");
const { createObjectCsvWriter } = require("csv-writer");
const { parse } = require("csv-parse");

const contactsFilePath = "contacts.csv";
const sentMessagesFilePath = path.join(__dirname, "sentMessages.csv");
const failedMessagesFilePath = path.join(__dirname, "failedMessages.csv");
const failedCSVFields = ["phoneNumber", "contactName"];
const SentCSVFields = ["clientId", "phoneNumber", "contactName", "timestamp"];
const MAX_CLIENTS = 1;
const CHUNK_SIZE = 20;
const DELAY_BETWEEN_MESSAGES = 2000; // 2 seconds
const MEMORY_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const contacts = [];
let sent = 0;
let clients = [];
let sendType = "";
let messageObj;
let isTestMessage = false;

// Initialize readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Parse the CSV file to extract contacts
// Update the CSV file with the modified contacts
const replaceDataInContactsFile = (rows) => {
  const headers = Object.keys(rows[0]).map((header) => ({
    id: header,
    title: header,
  }));
  const csvWriter = createObjectCsvWriter({
    path: contactsFilePath,
    header: headers,
  });

  return csvWriter.writeRecords(rows);
};

const updateContactsFile = async (rows) => {
  const existingRows = [];

  // Read the existing CSV file
  const parseCSV = () =>
    new Promise((resolve, reject) => {
      fs.createReadStream(contactsFilePath)
        .pipe(parse({ columns: true }))
        .on("data", (data) => existingRows.push(data))
        .on("end", () => resolve())
        .on("error", (error) => reject(error));
    });

  try {
    await parseCSV();
    const updatedRows = existingRows.map((existingRow) => {
      const updatedRow = rows.find(
        (row) =>
          row.ModifiedPhoneNumber === existingRow.ModifiedPhoneNumber &&
          row["First Name"] === existingRow["First Name"] &&
          row["Middle Name"] === existingRow["Middle Name"] &&
          row["Last Name"] === existingRow["Last Name"]
      );

      return updatedRow ? updatedRow : existingRow; // Replace if matched, otherwise keep the same
    });

    // Use the existing replaceDataInContactsFile function
    await replaceDataInContactsFile(updatedRows);
    console.log("Contacts file updated successfully.");
  } catch (error) {
    console.error("Error updating contacts file:", error);
  }
};

// Parse the CSV file and process contacts
const parseCSVAndInitializeClients = () => {
  const rows = [];
  fs.createReadStream(contactsFilePath)
    .pipe(csv())
    .on("data", (row) => {
      rows.push(row);
    })
    .on("end", async () => {
      // Check and fill missing columns
      if (!rows[0].hasOwnProperty("Status")) {
        rows.forEach((row) => {
          row.Status = "Not Sent"; // Add "Not Sent" status for all rows
        });
      } else {
        // Fill empty "Status" values with "Not Sent"
        rows.forEach((row) => {
          if (!row.Status) row.Status = "Not Sent";
        });
      }

      if (!rows[0].hasOwnProperty("ModifiedPhoneNumber")) {
        rows.forEach((row) => {
          row.ModifiedPhoneNumber = formatPhoneNumber(row["Phone 1 - Value"]);
        });
      } else {
        // Fill empty "ModifiedPhoneNumber" values
        rows.forEach((row) => {
          if (!row.ModifiedPhoneNumber) {
            row.ModifiedPhoneNumber = formatPhoneNumber(row["Phone 1 - Value"]);
          }
        });
      }

      // Write back the updated file
      await replaceDataInContactsFile(rows);

      console.log(
        "Contacts file updated with Status and ModifiedPhoneNumber columns."
      );

      // Filter contacts with Status: "Not Sent"
      const notSentContacts = rows.filter(
        (row) =>
          row.Status === "Not Sent" &&
          row.ModifiedPhoneNumber !== "Invalid phone number"
      );

      // Ask for the number of contacts to process
      rl.question("How many contacts do you want to process? ", (input) => {
        const numberToProcess = parseInt(input, 10);

        if (isNaN(numberToProcess) || numberToProcess <= 0) {
          console.error("Invalid input. Please enter a positive integer.");
          rl.close();
          return;
        }

        const contactsToProcess = notSentContacts.slice(0, numberToProcess);

        if (!CHUNK_SIZE || CHUNK_SIZE <= 0) {
          throw new Error("CHUNK_SIZE must be a positive integer.");
        }

        // Split contacts into chunks of CHUNK_SIZE
        const contactChunks = [];
        for (let i = 0; i < contactsToProcess.length; i += CHUNK_SIZE) {
          contactChunks.push(contactsToProcess.slice(i, i + CHUNK_SIZE));
        }

        console.log(
          `Processing ${contactsToProcess.length} contacts in ${contactChunks.length} chunks.`
        );

        // Initialize clients and start processing
        initializeClients(contactChunks);
      });
    })
    .on("error", (err) => {
      console.error("Error reading CSV file:", err);
    });
};

// Main CLI Menu
const selectOption = async () => {
  return new Promise(async (resolve) => {
    // Ask if it's a test message
    rl.question("Is this a test message? (y/n): ", async (testAnswer) => {
      if (testAnswer.toLowerCase() === "y") {
        isTestMessage = true;
      }

      // Now present the main options
      rl.question(
        "Select an option: \n1. Send Message Without Media\n2. Send Message With Media\n3. Select Message from Chat\nYour choice: ",
        async (option) => {
          console.log("Type of clients:", typeof clients);
          if (option === "1") {
            messageObj = createMessageWithoutMedia(isTestMessage);
            sendType = "Message Without Media";
          } else if (option === "2") {
            messageObj = createMessageWithMedia(isTestMessage);
            sendType = "Message With Media";
          } else if (option === "3") {
            messageObj = await createMessageFromChat(
              rl,
              isTestMessage,
              clients
            ); // Await the function to ensure it's completed
            sendType = "Message From Chat";
          } else {
            console.log("Invalid option. Exiting.");
            rl.close();
            resolve(); // Exit if the option is invalid
            return;
          }

          console.log(`You chose: ${sendType}`);
          rl.close(); // Close the CLI prompt after the selection
          resolve(); // Continue the process after the option is selected
        }
      );
    });
  });
};

// Function to initialize clients
const initializeClients = async (contactChunks) => {
  for (let i = 0; i < Math.min(MAX_CLIENTS, contactChunks.length); i++) {
    const client = await createClient(i + 1);
    clients.push({ client, id: i + 1, busy: false });
  }

  console.log("All clients are ready. ");

  await selectOption();
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

  // Create the CSV file with headers if it doesn't already exist
  if (!fs.existsSync(sentMessagesFilePath)) {
    const header = SentCSVFields.join(",") + "\n";
    fs.writeFileSync(sentMessagesFilePath, header);
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
    const phoneNumber = contact.ModifiedPhoneNumber;
    const chatId = `${phoneNumber}@c.us`;
    client
      .sendMessage(chatId, ...Object.values(messageObj))
      .then(() => {
        sent++;
        console.log(
          `Client ${clientId}: Message sent to ${contact.name} ${contact.last}. Total sent: ${sent}`
        );

        // Update the status to "Sent" in the original contacts list
        contact.Status = "Sent";

        // Create the message data object
        const messageData = {
          clientId,
          phoneNumber,
          contactName: `${contact["name"]} ${contact["last"]}`,
          timestamp: new Date().toISOString(),
        };

        // Append the message data to the CSV file in real time
        const csvRow = `${messageData.clientId},${messageData.phoneNumber},"${messageData.contactName}"\n`;
        fs.appendFileSync(sentMessagesFilePath, csvRow);

        // Write updated contacts back to the CSV file
        updateContactsFile(contacts)
          .then(() => {})
          .catch((err) => {
            console.error("Error updating contacts file:", err);
          });

        setTimeout(
          () => sendMessageToContact(index + 1),
          DELAY_BETWEEN_MESSAGES
        );
      })
      .catch((error) => {
        console.error(
          `Client ${clientId}: Failed to send message to ${contact["name"]} ${contact["last"]}:`,
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
