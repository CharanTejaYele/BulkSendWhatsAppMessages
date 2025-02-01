const path = require("path");

module.exports = {
    MAX_CLIENTS: 4,
    CHUNK_SIZE: 20,
    DELAY_BETWEEN_MESSAGES: 2000, // 2 seconds
    MEMORY_CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes
    contactsFilePath: "contacts.csv",
    sentMessagesFilePath: path.join(__dirname, "sentMessages.csv"),
    failedMessagesFilePath: path.join(__dirname, "failedMessages.csv"),
    failedCSVFields: ["contactName", "phoneNumber", "timestamp"],
    sentCSVFields: ["contactName", "phoneNumber", "timestamp"]
};