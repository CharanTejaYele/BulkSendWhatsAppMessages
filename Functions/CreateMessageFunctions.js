const { MessageMedia } = require("whatsapp-web.js");
const { getMessage, getFile } = require("../Message");
const fs = require("fs");

// Function to create a message without media (Option 1)
const createMessageWithoutMedia = () => {
  let messageText = getMessage();
  return { body: messageText };
};

const createMessageWithMedia = () => {
  let messageText = getMessage();

  const filePath = getFile(); // Assume this returns an object with path and type
  // Determine the MIME type based on the file type
  let mimeType;
  const fileType = filePath.slice(filePath.lastIndexOf(".") + 1).toLowerCase(); // Extract file extension
  switch (fileType) {
    case "png":
    case "jpg":
    case "jpeg":
      mimeType = `image/${fileType}`;
      break;
    case "mp4":
    case "mov":
      mimeType = `video/${fileType}`;
      break;
    case "mp3":
    case "wav":
      mimeType = `audio/${fileType}`;
      break;
    case "pdf":
      mimeType = "application/pdf";
      break;
    default:
      throw new Error("Unsupported file type");
  }

  // Read the file content
  // Assuming 'filePath' contains the path to the file
  const fileData = fs.readFileSync(filePath);

  // Create the media object
  const media = new MessageMedia(
    mimeType,
    fileData.toString("base64"),
    `${filePath.split("/").pop()}` // Use the actual file name
  );

  // Return the message object with media and options
  return {
    media,
    options: {
      caption: messageText, // Assuming messageText is defined or passed as an argument
    },
  };
};

const createMessageFromChat = async (rl, isTestMessage, clients) => {
  let messageObj = {}; // Initialize messageObj to ensure it's available for modification
  try {
    console.log("Type of clients:", typeof clients);
    console.log("Value of clients:", clients);

    if (!Array.isArray(clients)) {
      throw new Error("Invalid clients input. Expected an array.");
    }

    // Find the client with id === 1
    const client = clients.find((c) => c.id === 1);
    if (!client) {
      console.error("Client with id 1 not found!");
      return null;
    }

    // Fetch chats and get the last 5 chats
    const chats = await client.client.getChats();
    const lastChats = chats.slice(0, 5);

    // Display the last 5 chats for user selection
    console.log("Select a chat from the last 5 chats:");
    lastChats.forEach((chat, index) => {
      console.log(`${index + 1}. ${chat.name}`);
    });

    // Wait for the user's selection
    return new Promise((resolve) => {
      rl.question("Your choice: ", async (chatChoice) => {
        try {
          const choiceIndex = parseInt(chatChoice, 10) - 1;

          // Validate user's input
          if (
            isNaN(choiceIndex) ||
            choiceIndex < 0 ||
            choiceIndex >= lastChats.length
          ) {
            console.error("Invalid choice. Please select a valid option.");
            resolve(null);
            return;
          }

          // Get the selected chat
          const selectedChat = lastChats[choiceIndex];
          console.log(`Selected chat ID: ${selectedChat.id._serialized}`);

          // Fetch the chat by ID and get its most recent message
          const chat = await client.client.getChatById(
            selectedChat.id._serialized
          );
          const messages = await chat.fetchMessages({ limit: 1 });
          const lastMessage = messages[0];

          // Modify the existing messageObj
          if (lastMessage?.hasMedia) {
            const media = await lastMessage.downloadMedia();
            messageObj.media = media;
            messageObj.options = { caption: lastMessage.body || "" };
            console.log(
              `Message from chat selected. Media caption: ${lastMessage.body}`
            );
          } else if (lastMessage) {
            messageObj.body = lastMessage.body;
            console.log(`Message from chat selected: ${lastMessage.body}`);
          } else {
            console.warn("No messages found in the selected chat.");
          }

          resolve(messageObj); // Resolve with the updated messageObj
        } catch (err) {
          console.error("Error while processing the selected chat:", err);
          resolve(null); // Resolve with null in case of an error
        }
      });
    });
  } catch (err) {
    console.error("An error occurred:", err);
    return null; // Return null in case of a critical error
  }
};

module.exports = {
  createMessageWithoutMedia,
  createMessageWithMedia,
  createMessageFromChat,
};
