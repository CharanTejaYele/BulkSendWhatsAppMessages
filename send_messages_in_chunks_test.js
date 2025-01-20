const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");

// Function to split contacts into chunks of specified size
const splitContacts = (contacts, chunkSize) => {
  const chunks = [];
  for (let i = 0; i < contacts.length; i += chunkSize) {
    chunks.push(contacts.slice(i, i + chunkSize));
  }
  return chunks;
};

// Parse the CSV file to extract contacts
const contacts = [];
let sent = 0;

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

    // Split contacts into chunks of 300 each
    const contactChunks = splitContacts(contacts, 300);

    // Initialize clients sequentially
    initializeClientsSequentially(contactChunks);
  });

// Function to initialize clients sequentially
const initializeClientsSequentially = async (contactChunks) => {
  const clients = [];
  for (let i = 0; i < contactChunks.length; i++) {
    console.log(`Initializing client ${i + 1}...`);
    const client = await initializeClient(contactChunks[i], i + 1);
    clients.push(client);
  }

  console.log("All clients are ready. Starting to send messages...");

  // Start sending messages for all clients
  clients.forEach((clientData) => {
    sendMessagesSequentially(
      clientData.client,
      clientData.contactsChunk,
      clientData.clientId
    );
  });
};

// Function to initialize a single client and wait for QR scan
const initializeClient = (contactsChunk, clientId) => {
  return new Promise((resolve) => {
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: `whatsapp-client-${clientId}` }),
      puppeteer: { headless: true }, // Set to `false` if you want to see the browser in action
    });

    client.on("qr", (qr) => {
      qrcode.generate(qr, { small: true });
      console.log(
        `QR code for client ${clientId} generated. Please scan to authenticate.`
      );
    });

    client.on("ready", () => {
      console.log(`Client ${clientId} is ready!`);
      resolve({ client, contactsChunk, clientId });
    });

    client.initialize();
  });
};

// Function to send messages sequentially
const sendMessagesSequentially = (client, contacts, clientId) => {
  if (contacts.length === 0) {
    console.log(`No contacts to send messages to for client ${clientId}.`);
    return;
  }

  const sendMessageToContact = (index) => {
    if (index >= contacts.length) {
      console.log(
        `All messages sent for client ${clientId}. Total sent: ${sent}`
      );
      return;
    }

    const contact = contacts[index];
    const phoneNumber = contact.phone;
    const message = `Hello ${sent}, this is an automated message!`;
    const chatId = `${phoneNumber}@c.us`;
    const imagePath = path.join(__dirname, "NewTester.png");

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
        setTimeout(() => sendMessageToContact(index + 1), 3000); // 3-second delay before the next message
      })
      .catch((error) => {
        console.log(
          `Client ${clientId}: Failed to send message to ${contact.name} ${contact.last}:`,
          error
        );
        setTimeout(() => sendMessageToContact(index + 1), 3000); // Move to the next contact
      });
  };

  sendMessageToContact(0); // Start with the first contact
};
