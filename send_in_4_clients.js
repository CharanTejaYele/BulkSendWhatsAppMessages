const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");
const {getMessage,getImage} = require("./Message");

const MAX_CLIENTS = 4;
const CHUNK_SIZE = 300;
const DELAY_BETWEEN_MESSAGES = 2000; // 2 seconds

const contacts = [];
let sent = 0;
let clients = [];

// Parse the CSV file to extract contacts
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

// Function to initialize clients
const initializeClients = async (contactChunks) => {
  for (let i = 0; i < Math.min(MAX_CLIENTS,contactChunks.length); i++) {
    const client = await createClient(i + 1);
    clients.push({ client, id: i + 1, busy: false });
  }

  console.log("All clients are ready. Starting to assign tasks...");
  assignTasksParallel(contactChunks);
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
      console.log(`QR code for client ${clientId} generated. Please scan to authenticate.`);
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
      console.log(`Assigning a new chunk to client ${clientId}. Remaining chunks: ${pendingChunks.length}`);

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
      onComplete();
      return;
    }

    const contact = contacts[index];
    const phoneNumber = contact.phone;
    const message = getMessage(contact);
    const chatId = `${phoneNumber}@c.us`;
    const imagePath = path.join(__dirname, getImage());

    const media = new MessageMedia(
      "image/png",
      fs.readFileSync(imagePath).toString("base64"),
      "image.png"
    );

    client
      .sendMessage(chatId, media, { caption: message })
      .then(() => {
        sent++;
        console.log(
          `Client ${clientId}: Message sent to ${contact.name} ${contact.last}. Total sent: ${sent}`
        );
        setTimeout(() => sendMessageToContact(index + 1), DELAY_BETWEEN_MESSAGES);
      })
      .catch((error) => {
        console.log(
          `Client ${clientId}: Failed to send message to ${contact.name} ${contact.last}:`,
          error
        );
        setTimeout(() => sendMessageToContact(index + 1), DELAY_BETWEEN_MESSAGES);
      });
  };

  sendMessageToContact(0); // Start with the first contact
};
