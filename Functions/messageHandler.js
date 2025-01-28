const fs = require("fs");
const config = require("../config");
const {
  createMessageWithoutMedia,
  createMessageWithMedia,
  createMessageFromChat,
} = require("./CreateMessageFunctions");
const { updateContactsFile } = require("./configHandler");
const { restartClient } = require("./clientManager");

let messageObj;

function selectOption(rl, clients) {
  return new Promise((resolve) => {
    rl.question("Is this a test message? (y/n): ", async (testAnswer) => {
      const isTestMessage = testAnswer.toLowerCase() === "y";
      rl.question(
        "Select an option:\n1. Send Message Without Media\n2. Send Message With Media\n3. Select Message from Chat\nYour choice: ",
        async (option) => {
          let sendType;
          switch (option) {
            case "1":
              messageObj = createMessageWithoutMedia(isTestMessage);
              sendType = "Message Without Media";
              break;
            case "2":
              messageObj = createMessageWithMedia(isTestMessage);
              sendType = "Message With Media";
              break;
            case "3":
              messageObj = await createMessageFromChat(
                rl,
                isTestMessage,
                clients
              );
              sendType = "Message From Chat";
              break;
            default:
              console.log("Invalid option. Exiting.");
              rl.close();
              resolve();
              return;
          }
          console.log(`You chose: ${sendType}`);
          rl.close();
          resolve({ messageObj, sendType });
        }
      );
    });
  });
}

function sendMessages(client, contacts, clientId, onComplete) {
  if (!fs.existsSync(config.sentMessagesFilePath)) {
    const header = config.sentCSVFields.join(",") + "\n";
    fs.writeFileSync(config.sentMessagesFilePath, header);
  }

  if (!fs.existsSync(config.failedMessagesFilePath)) {
    const header = config.failedCSVFields.join(",") + "\n";
    fs.writeFileSync(config.failedMessagesFilePath, header);
  }

  async function sendMessageToContact(index) {
    if (index >= contacts.length) {
      console.log(`Client ${clientId}: All messages sent for this batch.`);
      await restartClient(clientId, { client });
      onComplete();
      return;
    }

    const contact = contacts[index];
    const phoneNumber = contact.ModifiedPhoneNumber;
    const chatId = `${phoneNumber}@c.us`;
    try {
      await client.sendMessage(chatId, ...Object.values(messageObj));
      console.log(
        `Client ${clientId}: Message sent to ${contact["First Name"]} ${contact["Middle Name"]} ${contact["Last Name"]}.`
      );
      contact.Status = "Sent";

      updateContactsFile(contacts)
        .then(() => {})
        .catch((err) => {
          console.error("Error updating contacts file:", err);
        });

      const csvRow = `${contact["First Name"]} ${contact["Middle Name"]} ${
        contact["Last Name"]
      },${phoneNumber}, ${new Date().toISOString()}\n`;
      fs.appendFileSync(config.sentMessagesFilePath, csvRow);

      setTimeout(
        () => sendMessageToContact(index + 1),
        config.DELAY_BETWEEN_MESSAGES
      );
    } catch (error) {
      console.error(
        `Client ${clientId}: Failed to send message to ${contact["name"]} ${contact["last"]}:`,
        error
      );
      const csvRow = `${contact["First Name"]} ${contact["Middle Name"]} ${
        contact["Last Name"]
      },${phoneNumber}, ${new Date().toISOString()}\n`;
      fs.appendFileSync(config.failedMessagesFilePath, csvRow);

      setTimeout(
        () => sendMessageToContact(index + 1),
        config.DELAY_BETWEEN_MESSAGES
      );
    }
  }

  sendMessageToContact(0);
}

module.exports = {
  selectOption,
  sendMessages,
};
