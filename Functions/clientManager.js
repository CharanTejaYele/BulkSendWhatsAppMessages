const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const config = require("../config");

function createClient(clientId) {
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
}

async function initializeClients() {
  const clients = [];
  for (let i = 0; i < config.MAX_CLIENTS; i++) {
    const client = await createClient(i + 1);
    clients.push({ client, id: i + 1, busy: false });
  }
  return clients;
}

async function restartClient(clientId, clientObj) {
  console.log(`Restarting client ${clientId}...`);
  try {
    await clientObj.client.destroy();
    const newClient = await createClient(clientId);
    clientObj.client = newClient;
    console.log(`Client ${clientId} restarted successfully.`);
  } catch (error) {
    console.error(`Failed to restart client ${clientId}:`, error);
  }
}

module.exports = {
  initializeClients,
  restartClient,
};
