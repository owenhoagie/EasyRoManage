const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

// Initialize Discord client
const client = new Client({ 
  intents: [GatewayIntentBits.Guilds] 
});

// Slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Shows username, country, known timezones, and total logins')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('The user ID to look up')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('lastlogin')
    .setDescription('Displays the most recent login information')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('The user ID to look up')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('timezonehistory')
    .setDescription('Lists all timezones that player has logged in from')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('The user ID to look up')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('loginhistory')
    .setDescription('Shows the last n login entries with timestamps and locations')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('The user ID to look up')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('count')
        .setDescription('Number of recent logins to show (default: 10)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(50)),

  new SlashCommandBuilder()
    .setName('logincount')
    .setDescription('Returns total number of recorded logins for that user')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('The user ID to look up')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('usersfromcountry')
    .setDescription('Lists all users who have logged in from a given country')
    .addStringOption(option =>
      option.setName('countrycode')
        .setDescription('Country code (e.g., US, UK, CA)')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('usersfromtimezone')
    .setDescription('Lists all users who have logged in from a given timezone')
    .addStringOption(option =>
      option.setName('timezone')
        .setDescription('Timezone name (e.g., Eastern Daylight Time)')
        .setRequired(true))
];

// Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function deployCommands() {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}

// Helper function to get user data
async function getUserData(userId) {
  const snapshot = await db.ref(`Players/${userId}`).once('value');
  return snapshot.val();
}

// Helper function to get all players data (for country/timezone searches)
async function getAllPlayersData() {
  const snapshot = await db.ref('Players').once('value');
  return snapshot.val();
}

// Command handlers
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    switch (commandName) {
      case 'userinfo':
        await handleUserInfo(interaction);
        break;
      case 'lastlogin':
        await handleLastLogin(interaction);
        break;
      case 'timezonehistory':
        await handleTimezoneHistory(interaction);
        break;
      case 'loginhistory':
        await handleLoginHistory(interaction);
        break;
      case 'logincount':
        await handleLoginCount(interaction);
        break;
      case 'usersfromcountry':
        await handleUsersFromCountry(interaction);
        break;
      case 'usersfromtimezone':
        await handleUsersFromTimezone(interaction);
        break;
    }
  } catch (error) {
    console.error('Command error:', error);
    const errorEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Error')
      .setDescription('An error occurred while processing your request.');
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
});

async function handleUserInfo(interaction) {
  const userId = interaction.options.getString('userid');
  const userData = await getUserData(userId);

  if (!userData) {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('User Not Found')
      .setDescription(`No data found for user ID: ${userId}`);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const username = userData.Username || 'Unknown';
  const totalLogins = userData.Logins ? Object.keys(userData.Logins).length : 0;
  const timezones = userData.Timezones ? Object.values(userData.Timezones).join(', ') : 'None';
  
  // Get most recent country
  let recentCountry = 'Unknown';
  if (userData.Logins) {
    const loginEntries = Object.values(userData.Logins);
    const mostRecent = loginEntries[loginEntries.length - 1];
    recentCountry = mostRecent?.CountryCode || 'Unknown';
  }

  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle(`User Information - ${username}`)
    .addFields(
      { name: 'User ID', value: userId, inline: true },
      { name: 'Username', value: username, inline: true },
      { name: 'Recent Country', value: recentCountry, inline: true },
      { name: 'Total Logins', value: totalLogins.toString(), inline: true },
      { name: 'Known Timezones', value: timezones, inline: false }
    );

  await interaction.reply({ embeds: [embed] });
}

async function handleLastLogin(interaction) {
  const userId = interaction.options.getString('userid');
  const userData = await getUserData(userId);

  if (!userData || !userData.Logins) {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('No Login Data')
      .setDescription(`No login data found for user ID: ${userId}`);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const loginEntries = Object.values(userData.Logins);
  const lastLogin = loginEntries[loginEntries.length - 1];

  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle(`Last Login - ${userData.Username || userId}`)
    .addFields(
      { name: 'Date & Time', value: lastLogin.Timestamp, inline: true },
      { name: 'Country', value: lastLogin.CountryCode, inline: true },
      { name: 'Timezone', value: lastLogin.Timezone, inline: true }
    );

  await interaction.reply({ embeds: [embed] });
}

async function handleTimezoneHistory(interaction) {
  const userId = interaction.options.getString('userid');
  const userData = await getUserData(userId);

  if (!userData || !userData.Timezones) {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('No Timezone Data')
      .setDescription(`No timezone data found for user ID: ${userId}`);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const timezones = Object.values(userData.Timezones).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle(`Timezone History - ${userData.Username || userId}`)
    .setDescription(timezones);

  await interaction.reply({ embeds: [embed] });
}

async function handleLoginHistory(interaction) {
  const userId = interaction.options.getString('userid');
  const count = interaction.options.getInteger('count') || 10;
  const userData = await getUserData(userId);

  if (!userData || !userData.Logins) {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('No Login Data')
      .setDescription(`No login data found for user ID: ${userId}`);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const loginEntries = Object.values(userData.Logins);
  const recentLogins = loginEntries.slice(-count).reverse();

  const loginText = recentLogins.map((login, index) => 
    `${index + 1}. ${login.Timestamp} - ${login.CountryCode} (${login.Timezone})`
  ).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle(`Login History - ${userData.Username || userId}`)
    .setDescription(loginText || 'No login history found');

  await interaction.reply({ embeds: [embed] });
}

async function handleLoginCount(interaction) {
  const userId = interaction.options.getString('userid');
  const userData = await getUserData(userId);

  if (!userData) {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('User Not Found')
      .setDescription(`No data found for user ID: ${userId}`);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const totalLogins = userData.Logins ? Object.keys(userData.Logins).length : 0;

  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle(`Login Count - ${userData.Username || userId}`)
    .setDescription(`Total recorded logins: **${totalLogins}**`);

  await interaction.reply({ embeds: [embed] });
}

async function handleUsersFromCountry(interaction) {
  await interaction.deferReply();
  
  const countryCode = interaction.options.getString('countrycode').toUpperCase();
  const allPlayers = await getAllPlayersData();

  if (!allPlayers) {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('No Data')
      .setDescription('No player data found in the database.');
    return interaction.editReply({ embeds: [embed] });
  }

  const usersFromCountry = [];

  Object.entries(allPlayers).forEach(([playerId, playerData]) => {
    if (playerData.Logins) {
      const hasCountry = Object.values(playerData.Logins).some(
        login => login.CountryCode === countryCode
      );
      if (hasCountry) {
        usersFromCountry.push(`${playerData.Username || playerId} (ID: ${playerId})`);
      }
    }
  });

  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle(`Users from Country: ${countryCode}`)
    .setDescription(usersFromCountry.length > 0 ? 
      usersFromCountry.slice(0, 20).join('\n') + 
      (usersFromCountry.length > 20 ? `\n\n... and ${usersFromCountry.length - 20} more` : '') :
      'No users found from this country'
    );

  await interaction.editReply({ embeds: [embed] });
}

async function handleUsersFromTimezone(interaction) {
  await interaction.deferReply();
  
  const timezone = interaction.options.getString('timezone');
  const allPlayers = await getAllPlayersData();

  if (!allPlayers) {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('No Data')
      .setDescription('No player data found in the database.');
    return interaction.editReply({ embeds: [embed] });
  }

  const usersFromTimezone = [];

  Object.entries(allPlayers).forEach(([playerId, playerData]) => {
    if (playerData.Timezones) {
      const hasTimezone = Object.values(playerData.Timezones).some(
        tz => tz.toLowerCase().includes(timezone.toLowerCase())
      );
      if (hasTimezone) {
        usersFromTimezone.push(`${playerData.Username || playerId} (ID: ${playerId})`);
      }
    }
  });

  const embed = new EmbedBuilder()
    .setColor(0x00AE86)
    .setTitle(`Users from Timezone: ${timezone}`)
    .setDescription(usersFromTimezone.length > 0 ? 
      usersFromTimezone.slice(0, 20).join('\n') + 
      (usersFromTimezone.length > 20 ? `\n\n... and ${usersFromTimezone.length - 20} more` : '') :
      'No users found from this timezone'
    );

  await interaction.editReply({ embeds: [embed] });
}

// Bot ready event
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  deployCommands();
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);