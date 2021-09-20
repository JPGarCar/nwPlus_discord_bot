require('dotenv-flow').config();
const mongoUtil = require('./db/mongo/mongoUtil');
const Commando = require('discord.js-commando');
const Discord = require('discord.js');
const firebaseServices = require('./db/firebase/firebase-services');
const winston = require('winston');
const fs = require('fs');
const discordServices = require('./discord-services');
const BotGuild = require('./db/mongo/BotGuild');
const BotGuildModel = require('./classes/Bot/bot-guild');
const Verification = require('./classes/Bot/Features/Verification/verification');
const { StringPrompt } = require('advanced-discord.js-prompts');

/**
 * The Main App module houses the bot events, process events, and initializes
 * the bot. It also handles new members and greets them.
 * @module MainApp
 */


/**
 * Returns the config settings depending on the command line args.
 * Read command line args to know if prod, dev, or test and what server
 * First arg is one of prod, dev or test
 * the second is the test server, but the first one must be test
 * @param {string[]} args 
 * @returns {Map} config settings
 */
function getConfig(args) {
    if (args.length >= 1) {
        if (args[0] === 'dev') {
            // Default dev
            return JSON.parse(process.env.DEV);
        } else if (args[0] === 'prod') {
            // Production
            if (args[1] === 'yes') {
                return JSON.parse(process.env.PROD);
            }
        } else if (args[0] === 'test') {
            // Test
            const testConfig = JSON.parse(process.env.TEST);
            let server = args[1] ?? 0;
            if (server === '1') {
                return testConfig['ONE'];
            } else if (server === '2') {
                return testConfig['TWO'];
            } else if (server === '3') {
                return testConfig['THREE'];
            } else if (server === '4') {
                return testConfig['FOUR'];
            }
        }
    }
    
    // exit if no configs are loaded!
    console.log('No configs were found for given args.');
    process.exit(0);
}

const config = getConfig(process.argv.slice(2));

const isLogToConsole = config['consoleLog'];

const bot = new Commando.Client({
    commandPrefix: '!',
    owner: config.owner,
});

const customLoggerLevels = {
    levels: {
        error: 0,
        warning: 1,
        command: 2,
        event: 3,
        userStats: 4,
        verbose: 5,
        debug: 6,
        silly: 7,
    },
    colors: {
        error: 'red',
        warning: 'yellow',
        command: 'blue',
        event: 'green',
        userStats: 'magenta',
        verbose: 'cyan',
        debug: 'white',
        silly: 'black',
    }
};

// the main logger to use for general errors
const mainLogger = createALogger('main', 'main', true, isLogToConsole);
winston.addColors(customLoggerLevels.colors);


/**
 * Register all the commands except for help and unknown since we have our own.
 */
bot.registry
    .registerDefaultTypes()
    .registerGroup('a_boothing', 'boothing group for admins')
    .registerGroup('a_activity', 'activity group for admins')
    .registerGroup('a_start_commands', 'advanced admin commands')
    .registerGroup('a_utility', 'utility commands for admins')
    .registerGroup('hacker_utility', 'utility commands for users')
    .registerGroup('verification', 'verification commands')
    .registerGroup('attendance', 'attendance commands')
    .registerGroup('stamps', 'stamp related commands')
    .registerGroup('utility', 'utility commands')
    .registerGroup('essentials', 'essential commands for any guild', true)
    .registerDefaultGroups()
    .registerDefaultCommands({
        unknownCommand: false,
        help: false,
    })
    .registerCommandsIn(__dirname + '/commands');

/**
 * Runs when the bot finishes the set up and is ready to work.
 */
bot.once('ready', async () => {
    mainLogger.warning('The bot ' + bot.user.username + ' has started and is ready to hack!');
    
    bot.user.setActivity('nwplus.github.io/Factotum');

    // initialize firebase
    const adminSDK = JSON.parse(process.env.NWPLUSADMINSDK);
    firebaseServices.initializeFirebaseAdmin('nwPlusBotAdmin', adminSDK, 'https://nwplus-bot.firebaseio.com');
    mainLogger.warning('Connected to firebase admin sdk successfully!', { event: 'Ready Event' });

    // set mongoose connection
    await mongoUtil.mongooseConnect();
    mainLogger.warning('Connected to mongoose successfully!', { event: 'Ready Event' });

    // make sure all guilds have a botGuild, this is in case the bot goes offline and its added
    // to a guild. If botGuild is found, make sure only the correct commands are enabled.
    bot.guilds.cache.forEach(async (guild, key, guilds) => {
        // create the logger for the guild
        createALogger(guild.id, guild.name, false, isLogToConsole);

        let botGuild = await BotGuild.findById(guild.id);
        if (!botGuild) {
            newGuild(guild);
            mainLogger.verbose(`Created a new botGuild for the guild ${guild.id} - ${guild.name} on bot ready.`, { event: 'Ready Event' });
        } else {
            // set all non guarded commands to not enabled for the guild
            bot.registry.groups.forEach((group, key, map) => {
                if (!group.guarded) guild.setGroupEnabled(group, false);
            });

            await botGuild.setCommandStatus(bot);

            guild.commandPrefix = botGuild.prefix;
            
            mainLogger.verbose(`Found a botGuild for ${guild.id} - ${guild.name} on bot ready.`, { event: 'Ready Event' });
        }
    });
});

/**
 * Runs when the bot is added to a guild.
 */
bot.on('guildCreate', /** @param {Commando.CommandoGuild} guild */(guild) => {
    mainLogger.warning(`The bot was added to a new guild: ${guild.id} - ${guild.name}.`, { event: 'Guild Create Event' });

    newGuild(guild);

    // create a logger for this guild
    createALogger(guild.id, guild.name);
});


/**
 * Will set up a new guild.
 * @param {Commando.CommandoGuild} guild
 * @private
 */
function newGuild(guild) {
    // set all non guarded commands to not enabled for the new guild
    bot.registry.groups.forEach((group, key, map) => {
        if (!group.guarded) guild.setGroupEnabled(group, false);
    });
    // create a botGuild object for this new guild.
    BotGuild.create({
        _id: guild.id,
    });
}

/**
 * Runs when the bot is removed from a server.
 */
bot.on('guildDelete', async (guild) => {
    mainLogger.warning(`The bot was removed from the guild: ${guild.id} - ${guild.name}`);

    let botGuild = await BotGuild.findById(guild.id);
    botGuild.remove();
    mainLogger.verbose(`BotGuild with id: ${guild.id} has been removed!`);
});

/**
 * Runs when the bot runs into an error.
 */
bot.on('error', (error) => {
    mainLogger.error(`Bot Error: ${error.name} - ${error.message}.`, { event: 'Error', data: error});
});

/**
 * Runs when the bot runs into an error when running a command.
 */
bot.on('commandError', (command, error, message) => {
    winston.loggers.get(message.channel?.guild?.id || 'main').error(`Command Error: In command ${command.name} got uncaught rejection ${error.name} : ${error.message}`, { event: 'Error', data: error});
});

/**
 * Runs when a message is sent in any server the bot is running in.
 */
bot.on('message', async message => {
    if (message?.guild) {
        let botGuild = await BotGuild.findById(message.guild.id);

        // Deletes all messages to any channel in the black list with the specified timeout
        // this is to make sure that if the message is for the bot, it is able to get it
        // bot and staff messages are not deleted
        if (botGuild.blackList.has(message.channel.id)) {
            if (!message.author.bot && !discordServices.checkForRole(message.member, botGuild.roleIDs.staffRole)) {
                winston.loggers.get(message.guild.id).verbose(`Deleting message from user ${message.author.id} due to being in the blacklisted channel ${message.channel.name}.`);
                (new Promise(res => setTimeout(res, botGuild.blackList.get(message.channel.id)))).then(() => discordServices.deleteMessage(message));
            }
        }
    }
});

/**
 * Runs when a new member joins a guild the bot is running in.
 */
bot.on('guildMemberAdd', async member => {
    let botGuild = await BotGuild.findById(member.guild.id);

    // if the guild where the user joined is complete then greet and verify.
    // also checks to make sure it does not greet bots
    if (botGuild.isSetUpComplete && !member.user.bot) {
        try {
            winston.loggers.get(member.guild.id).userStats('A new user joined the guild and is getting greeted!');
            await greetNewMember(member, botGuild);
        } catch (error) {
            await fixDMIssue(error, member, botGuild);
        }
    } else {
        winston.loggers.get(member.guild.id).warning('A new user joined the guild but was not greeted because the bot is not set up!');
    }
});

bot.on('commandRun', (command, promise, message, args) => {
    winston.loggers.get(message?.guild?.id || 'main').command(`The command ${command.name} with args ${args} is being run from the channel ${message.channel} with id ${message.channel.id} 
        triggered by the message with id ${message.id} by the user with id ${message.author.id}`);
});

/**
 * Runs when an unknown command is triggered.
 */
bot.on('unknownCommand', (message) => winston.loggers.get(message?.guild?.id || 'main').command(`An unknown command has been triggered in the channel ${message.channel.name} with id ${message.channel.id}. The message had the content ${message.cleanContent}.`));

/**
 * Logs in the bot 
 */
bot.login(config.token).catch(console.error);

/**
 * Runs when the node process has an uncaught exception.
 */
process.on('uncaughtException', (error) => {
    console.log(
        'Uncaught Rejection, reason: ' + error.name +
        '\nmessage: ' + error.message +
        '\nfile: ' + error.fileName +
        '\nline number: ' + error.lineNumber +
        '\nstack: ' + error.stack
    );
});

/**
 * Runs when the node process has an unhandled rejection.
 */
process.on('unhandledRejection', (error, promise) => {
    console.log('Unhandled Rejection at:', promise,
        'Unhandled Rejection, reason: ' + error.name +
        '\nmessage: ' + error.message +
        '\nfile: ' + error.fileName +
        '\nline number: ' + error.lineNumber +
        '\nstack: ' + error.stack
    );
});

/**
 * Runs when the node process is about to exit and quit.
 */
process.on('exit', () => {
    mainLogger.warning('Node is exiting!');
});

/**
 * Will create a default logger to use.
 * @param {String} loggerName
 * @param {String} [loggerLabel=''] - usually a more readable logger name
 * @param {Boolean} [handleRejectionsExceptions=false] - will handle rejections and exceptions if true
 * @param {Boolean} [LogToConsole=false] - will log all levels to console if true
 * @returns {winston.Logger}
 */
function createALogger(loggerName, loggerLabel = '', handelRejectionsExceptions = false, logToConsole = false) {
    // custom format
    let format = winston.format.printf(info => `${info.timestamp} [${info.label}] ${info.level}${info?.event ? ' <' + info.event + '>' : ''} : ${info.message} ${info?.data ? 'DATA : ' + info.data : '' }`);

    // create main logs directory if not present
    if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');

    // create the directory if not present
    if (!fs.existsSync(`./logs/${loggerName}`)) fs.mkdirSync(`./logs/${loggerName}`);
    let logger = winston.loggers.add(loggerName, {
        levels: customLoggerLevels.levels,
        transports: [
            new winston.transports.File({ filename: `./logs/${loggerName}/logs.log`, level: 'silly' }),
            new winston.transports.File({ filename: `./logs/${loggerName}/debug.log`, level: 'debug' }),
            new winston.transports.File({ filename: `./logs/${loggerName}/verbose.log`, level: 'verbose' }),
            new winston.transports.File({ filename: `./logs/${loggerName}/userStats.log`, level: 'userStats' }),
            new winston.transports.File({ filename: `./logs/${loggerName}/event.log`, level: 'event' }),
            new winston.transports.File({ filename: `./logs/${loggerName}/command.log`, level: 'command' }),
            new winston.transports.File({ filename: `./logs/${loggerName}/warning.log`, level: 'warning' }),
            new winston.transports.File({ filename: `./logs/${loggerName}/error.log`, level: 'error', handleExceptions: handelRejectionsExceptions, handleRejections: handelRejectionsExceptions, }),
            ...(logToConsole ? [new winston.transports.Console({ 
                level: 'silly', 
                format: winston.format.combine(
                    winston.format.colorize({ level: true }),
                    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                    winston.format.splat(),
                    winston.format.label({ label: loggerLabel}),
                    format,
                ),
                handleExceptions: true,
                handleRejections: true,
            })] : []),
        ],
        exitOnError: false,
        format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.splat(),
            winston.format.label({ label: loggerLabel}),
            format,
        )
    });
    return logger;
}

/**
 * Greets a member!
 * @param {Discord.GuildMember} member - the member to greet
 * @param {BotGuildModel} botGuild
 * @throws Error if the user has server DMs off
 */
async function greetNewMember(member, botGuild) {
    let verifyEmoji = '🍀';

    var embed = new Discord.MessageEmbed()
        .setTitle(`Welcome to the ${member.guild.name} Server!`)
        .setDescription('We are very excited to have you here!')
        .addField('Have a question?', 'Visit the #welcome-support channel to talk with our staff!')
        .addField('Want to learn more about what I can do?', 'Use the !help command anywhere and I will send you a message!')
        .setColor(botGuild.colors.embedColor);

    if (botGuild.verification.isEnabled) embed.addField('Gain more access by verifying yourself!', 'React to this message with ' + verifyEmoji + ' and follow my instructions!');
    
    let msg = await member.send(embed);

    // if verification is on then give guest role and let user verify
    if (botGuild.verification.isEnabled) {
        discordServices.addRoleToMember(member, botGuild.verification.guestRoleID);

        msg.react(verifyEmoji);
        let verifyCollector = msg.createReactionCollector((reaction, user) => !user.bot && reaction.emoji.name === verifyEmoji);

        verifyCollector.on('collect', async (reaction, user) => {
            try {
                var email = await StringPrompt.single({prompt: 'Please send me your email associated to this event!', channel: member.user.dmChannel, userId: member.id, time: 30, cancelable: true});
            } catch (error) {
                discordServices.sendEmbedToMember(member, {
                    title: 'Verification Error',
                    description: 'Email was not provided, please try again!'
                }, true);
                return;
            }

            try {
                await Verification.verify(member, email, member.guild, botGuild);
            } catch (error) {
                discordServices.sendEmbedToMember(member, {
                    title: 'Verification Error',
                    description: 'Email provided is not valid! Please try again.'
                }, true);
            }
        });
    }
    // if verification is off, then just give member role
    else {
        discordServices.addRoleToMember(member, botGuild.roleIDs.memberRole);
    }
}

/**
 * Will let the member know how to fix their DM issue.
 * @param {Error} error - the error
 * @param {Discord.GuildMember} member - the member with the error
 * @param {BotGuildModel} botGuild
 * @throws Error if the given error is not a DM error
 */
async function fixDMIssue(error, member, botGuild) {
    if (error.code === 50007) {
        let logger = winston.loggers.get(member.guild.id);
        logger.warning(`A new user with id ${member.id} joined the guild but was not able to be greeted, we have asked him to fix the issues!`);
        let channelID = botGuild.verification?.welcomeSupportChannelID || botGuild.channelIDs.botSupportChannel;

        member.guild.channels.resolve(channelID).send('<@' + member.id + '> I couldn\'t reach you :(.' +
            '\n* Please turn on server DMs, explained in this link: https://support.discord.com/hc/en-us/articles/217916488-Blocking-Privacy-Settings-' +
            '\n* Once this is done, please react to this message with 🤖 to let me know!').then(msg => {
            msg.react('🤖');
            const collector = msg.createReactionCollector((reaction, user) => user.id === member.id && reaction.emoji.name === '🤖');

            collector.on('collect', (reaction, user) => {
                reaction.users.remove(user.id);
                try {
                    greetNewMember(member);
                    collector.stop();
                    msg.delete();
                    logger.userStats(`A user with id ${member.id} was able to fix the DM issue and was greeted!`);
                } catch (error) {
                    member.guild.channels.resolve(channelID).send('<@' + member.id + '> Are you sure you made the changes? I couldn\'t reach you again 😕').then(msg => msg.delete({ timeout: 8000 }));
                }
            });
        });
    } else {
        throw error;
    }
}
