# EasyRoManage

A powerful Discord bot designed to help Roblox game creators manage player data, track logins, and handle moderation through external ban management. Built with Firebase integration and Roblox Open Cloud API support.

## Features

### Player Management
- **User Information**: View comprehensive player data including username, country, timezones, and login statistics
- **Login Tracking**: Monitor player login history with timestamps and geographic locations
- **Geographic Analytics**: Find players by country or timezone
- **Login Statistics**: Track total login counts and patterns

### Blacklist Management
- **Seamless Ban System**: Add/remove users from blacklist with automatic Roblox game restrictions
- **Dual Storage**: Maintains blacklist in both Firebase and Roblox Open Cloud for reliability
- **Bulk Operations**: Sync all existing blacklisted users to Roblox games
- **Detailed Logging**: Track public and private reasons for each blacklist entry

### Analytics & Monitoring
- **Geographic Insights**: Analyze player distribution by country and timezone
- **Login Patterns**: View detailed login history and frequency analysis
- **Real-time Data**: Live player tracking and status updates

## Commands

### Player Information
- `/userinfo <userid>` - Display username, country, timezones, and total logins
- `/lastlogin <userid>` - Show most recent login information
- `/loginhistory <userid> [count]` - List recent login entries (default: 10)
- `/logincount <userid>` - Get total number of recorded logins
- `/timezonehistory <userid>` - View all timezones a player has used

### Geographic Analytics
- `/usersfromcountry <countrycode>` - List all users from a specific country
- `/usersfromtimezone <timezone>` - Find users from a particular timezone

### Blacklist Management
- `/addblacklist <userid> <publicreason> <hiddenreason>` - Add user to blacklist
- `/removeblacklist <userid>` - Remove user from blacklist
- `/viewblacklist <userid>` - Check blacklist status and reasons
- `/blacklisted` - View paginated list of all blacklisted users
- `/syncblacklist` - Sync all Firebase blacklist entries to Roblox (Admin only)

## Setup

### Prerequisites
- Node.js 16+ 
- Discord Application with Bot Token
- Firebase Project with Realtime Database
- Roblox Open Cloud API Key
- Railway account (for deployment)

### Environment Variables

```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_id

# Firebase Configuration (Option 1: JSON)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}

# Firebase Configuration (Option 2: Individual vars)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_CLIENT_ID=your_client_id
FIREBASE_CLIENT_CERT_URL=your_cert_url
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com

# Roblox Configuration
ROBLOX_API_KEY=your_roblox_open_cloud_api_key
ROBLOX_UNIVERSE_IDS=123456789,987654321
```

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/EasyRoManage.git
cd EasyRoManage
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables (create `.env` file or set in deployment platform)

4. Run the bot:
```bash
node bot.js
```

### Deployment on Railway

1. Connect your GitHub repository to Railway
2. Add all required environment variables in Railway dashboard
3. Deploy automatically on push to main branch

## Database Structure

### Firebase Realtime Database
```json
{
  "Players": {
    "userId": {
      "Username": "PlayerName",
      "Logins": {
        "loginId": {
          "Timestamp": "2024-01-01 12:00:00",
          "CountryCode": "US",
          "Timezone": "Eastern Standard Time"
        }
      },
      "Timezones": {
        "1": "Eastern Standard Time",
        "2": "Pacific Daylight Time"
      }
    }
  },
  "Blacklist": {
    "userId": {
      "UserId": "123456789",
      "Username": "PlayerName",
      "PublicReason": "Violation of terms",
      "HiddenReason": "Detailed staff notes",
      "DateAdded": "2024-01-01T12:00:00.000Z"
    }
  }
}
```

## Roblox Integration

The bot integrates with Roblox's Open Cloud API to:
- Fetch player usernames automatically
- Apply game-level restrictions to blacklisted users
- Manage restrictions across multiple universes
- Provide detailed error handling and status reporting

### Required Roblox Permissions
Your Open Cloud API key must have the following permissions for each game universe:
- **User Restrictions: Read** - View existing player restrictions
- **User Restrictions: Write** - Create and modify player restrictions

## Features in Detail

### Dual Ban System
EasyRoManage maintains bans in both Firebase and Roblox simultaneously:
- **Firebase**: Permanent record keeping and fast lookups
- **Roblox**: Active game restrictions and enforcement
- **Sync Function**: Ensures consistency between both systems

### Geographic Tracking
- Automatic timezone detection from login data
- Country-based player analytics
- Historical timezone tracking for security monitoring

### Error Handling
- Graceful failures with detailed error messages
- Partial success handling for multi-universe operations
- Comprehensive logging for troubleshooting

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:
- Create an issue on GitHub
- Check existing documentation and error messages
- Ensure all environment variables are properly configured

## Acknowledgments

- Built for Roblox game creators managing 300,000+ visit games
- Powered by Discord.js, Firebase, and Roblox Open Cloud APIs
- Deployed on Railway for 24/7 reliability
