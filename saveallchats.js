const { Client, LocalAuth } = require("whatsapp-web.js");
const fs = require("fs");
const csvWriter = require("csv-write-stream");

// Create a new instance of the client
const client = new Client({
  authStrategy: new LocalAuth({ clientId: `whatsapp-client-${1}` }),
  puppeteer: { headless: true },
});

// Store today's message chat details
let todaysChats = [];

client.on("ready", () => {
  console.log("Client is ready!");

  // Fetch all chats
  client.getChats().then((chats) => {
    chats.forEach((chat) => {
      todaysChats.push({ chatId: chat.id._serialized, name: chat.name || "Unknown" });
    });

    // After processing all chats, write to CSV
    setTimeout(() => {
      const writer = csvWriter({ headers: ["chatId", "name"] });
      writer.pipe(fs.createWriteStream("sent_chat_ids.csv"));
      todaysChats.forEach((chat) => {
        writer.write(chat);
      });
      writer.end();
      console.log("Sent chat IDs and names saved to sent_chat_ids.csv");
    }, 30000); // Wait for 30 seconds to ensure all messages are processed
  });
});

// Initialize the client
client.initialize();
