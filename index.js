const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const admin = require('firebase-admin');
const axios = require('axios');

// Initialize Firebase Admin SDK
let serviceAccount;

// Try to parse FIREBASE_SERVICE_ACCOUNT as JSON first, fallback to individual env vars
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (error) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', error);
    process.exit(1);
  }
} else {
  // Fallback to individual environment variables
  serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : null,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
  };
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

// Initialize Discord client
const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
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
        .setRequired(true)),

  // Blacklist commands
  new SlashCommandBuilder()
    .setName('addblacklist')
    .setDescription('Adds a user to the blacklist')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('The user ID to blacklist')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('publicreason')
        .setDescription('Public reason for blacklisting')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('hiddenreason')
        .setDescription('Hidden reason for blacklisting')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('removeblacklist')
    .setDescription('Removes a user from the blacklist')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('The user ID to remove from blacklist')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('viewblacklist')
    .setDescription('Check if a user is blacklisted and view their reasons')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('The user ID to check')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('blacklisted')
    .setDescription('Shows a list of all blacklisted users')
];

// Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function deployCommands() {
  try {
    console.log('Started refreshing application (/) commands.');
    console.log(`Registering ${commands.length} commands...`);

    const data = await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    console.log('Commands registered:', data.map(cmd => cmd.name).join(', '));
  } catch (error) {
    console.error('Error deploying commands:', error);
    if (error.code === 50001) {
      console.error('Missing Access - Make sure the bot has applications.commands scope!');
    }
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

// Helper function to get blacklist data
async function getBlacklistData(userId = null) {
  if (userId) {
    const snapshot = await db.ref(`Blacklist/${userId}`).once('value');
    return snapshot.val();
  } else {
    const snapshot = await db.ref('Blacklist').once('value');
    return snapshot.val();
  }
}

// Helper function to get Roblox username
async function getRobloxUsername(userId) {
  try {
    const response = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
    return response.data.name || 'Unknown';
  } catch (error) {
    console.error('Error fetching Roblox username:', error);
    return 'Unknown';
  }
}

// Command handlers
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
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
        case 'addblacklist':
          await handleAddBlacklist(interaction);
          break;
        case 'removeblacklist':
          await handleRemoveBlacklist(interaction);
          break;
        case 'viewblacklist':
          await handleViewBlacklist(interaction);
          break;
        case 'blacklisted':
          await handleBlacklistedList(interaction);
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
  } else if (interaction.isButton()) {
    // Handle pagination buttons for blacklisted command
    if (interaction.customId.startsWith('blacklist_page_')) {
      await handleBlacklistPagination(interaction);
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

// Blacklist command handlers
async function handleAddBlacklist(interaction) {
  await interaction.deferReply();
  
  const userId = interaction.options.getString('userid');
  const publicReason = interaction.options.getString('publicreason');
  const hiddenReason = interaction.options.getString('hiddenreason');

  // Check if user is already blacklisted
  const existingBlacklist = await getBlacklistData(userId);
  if (existingBlacklist) {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Already Blacklisted')
      .setDescription(`User ID ${userId} is already blacklisted.`);
    return interaction.editReply({ embeds: [embed] });
  }

  // Get username from Roblox API
  const username = await getRobloxUsername(userId);

  // Add to blacklist
  const blacklistData = {
    UserId: userId,
    Username: username,
    PublicReason: publicReason,
    HiddenReason: hiddenReason,
    DateAdded: new Date().toISOString()
  };

  try {
    await db.ref(`Blacklist/${userId}`).set(blacklistData);
    
    const embed = new EmbedBuilder()
      .setColor(0xFF4444)
      .setTitle('User Blacklisted')
      .addFields(
        { name: 'User ID', value: userId, inline: true },
        { name: 'Username', value: username, inline: true },
        { name: 'Public Reason', value: publicReason, inline: false },
        { name: 'Hidden Reason', value: hiddenReason, inline: false }
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error adding to blacklist:', error);
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Error')
      .setDescription('Failed to add user to blacklist.');
    await interaction.editReply({ embeds: [embed] });
  }
}

async function handleRemoveBlacklist(interaction) {
  const userId = interaction.options.getString('userid');

  // Check if user is blacklisted
  const blacklistData = await getBlacklistData(userId);
  if (!blacklistData) {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('User Not Found')
      .setDescription(`User ID ${userId} is not blacklisted.`);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  try {
    await db.ref(`Blacklist/${userId}`).remove();
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('User Removed from Blacklist')
      .setDescription(`User ${blacklistData.Username || userId} (ID: ${userId}) has been removed from the blacklist.`);

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error removing from blacklist:', error);
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('Error')
      .setDescription('Failed to remove user from blacklist.');
    await interaction.reply({ embeds: [embed] });
  }
}

async function handleViewBlacklist(interaction) {
  const userId = interaction.options.getString('userid');
  const blacklistData = await getBlacklistData(userId);

  if (!blacklistData) {
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('User Status')
      .setDescription(`User ID ${userId} is **not blacklisted**.`);
    return interaction.reply({ embeds: [embed] });
  }

  const embed = new EmbedBuilder()
    .setColor(0xFF4444)
    .setTitle('Blacklisted User')
    .addFields(
      { name: 'User ID', value: blacklistData.UserId, inline: true },
      { name: 'Username', value: blacklistData.Username || 'Unknown', inline: true },
      { name: 'Date Added', value: blacklistData.DateAdded ? new Date(blacklistData.DateAdded).toLocaleString() : 'Unknown', inline: true },
      { name: 'Public Reason', value: blacklistData.PublicReason, inline: false },
      { name: 'Hidden Reason', value: blacklistData.HiddenReason, inline: false }
    );

  await interaction.reply({ embeds: [embed] });
}

async function handleBlacklistedList(interaction) {
  await interaction.deferReply();
  
  const allBlacklisted = await getBlacklistData();
  
  if (!allBlacklisted || Object.keys(allBlacklisted).length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('Blacklist')
      .setDescription('No users are currently blacklisted.');
    return interaction.editReply({ embeds: [embed] });
  }

  const blacklistedUsers = Object.values(allBlacklisted);
  const usersPerPage = 10;
  const totalPages = Math.ceil(blacklistedUsers.length / usersPerPage);
  
  await sendBlacklistPage(interaction, blacklistedUsers, 1, totalPages);
}

async function sendBlacklistPage(interaction, users, page, totalPages) {
  const usersPerPage = 10;
  const startIndex = (page - 1) * usersPerPage;
  const endIndex = Math.min(startIndex + usersPerPage, users.length);
  const pageUsers = users.slice(startIndex, endIndex);

  const userList = pageUsers.map((user, index) => 
    `${startIndex + index + 1}. **${user.Username || 'Unknown'}** (ID: ${user.UserId})`
  ).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xFF4444)
    .setTitle(`Blacklisted Users (Page ${page}/${totalPages})`)
    .setDescription(userList)
    .setFooter({ text: `Total blacklisted users: ${users.length}` });

  const row = new ActionRowBuilder();
  
  if (totalPages > 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('blacklist_page_1')
        .setLabel('First')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 1),
      new ButtonBuilder()
        .setCustomId(`blacklist_page_${page - 1}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 1),
      new ButtonBuilder()
        .setCustomId(`blacklist_page_${page + 1}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages),
      new ButtonBuilder()
        .setCustomId(`blacklist_page_${totalPages}`)
        .setLabel('Last')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === totalPages)
    );
  }

  const options = { embeds: [embed] };
  if (totalPages > 1) {
    options.components = [row];
  }

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(options);
  } else {
    await interaction.reply(options);
  }
}

async function handleBlacklistPagination(interaction) {
  await interaction.deferUpdate();
  
  const pageNumber = parseInt(interaction.customId.split('_')[2]);
  const allBlacklisted = await getBlacklistData();
  
  if (!allBlacklisted) return;
  
  const blacklistedUsers = Object.values(allBlacklisted);
  const totalPages = Math.ceil(blacklistedUsers.length / 10);
  
  await sendBlacklistPage(interaction, blacklistedUsers, pageNumber, totalPages);
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
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  console.log(`Bot is in ${client.guilds.cache.size} guilds`);
  
  // Force command registration
  console.log('Force refreshing all commands...');
  await deployCommands();
  
  console.log('Bot is ready and commands are being registered!');
  console.log(`Total commands to register: ${commands.length}`);
  commands.forEach(cmd => console.log(`- ${cmd.name}`));
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

// Manual command refresh (for debugging)
client.on('messageCreate', async (message) => {
  if (message.content === '!refresh-commands' && message.author.id === process.env.DISCORD_OWNER_ID) {
    await message.reply('Refreshing commands...');
    await deployCommands();
    await message.reply('Commands refreshed!');
  }
});
