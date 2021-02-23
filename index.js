require('dotenv-flow').config();
const mongoUtil = require('./db/mongo/mongoUtil');
const Commando = require('discord.js-commando');
const Discord = require('discord.js');
const firebaseServices = require('./db/firebase/firebase-services');

// initialize firebase
const adminSDK = JSON.parse(process.env.NWPLUSADMINSDK);
firebaseServices.initializeFirebaseAdmin('nwPlusBotAdmin', adminSDK, "https://nwplus-bot.firebaseio.com");


const discordServices = require('./discord-services');
const Prompt = require('./classes/prompt');
const BotGuild = require('./db/mongo/BotGuild');
const BotGuildModel = require('./classes/bot-guild');
const Verification = require('./classes/verification');

const config = {
    token: process.env.TOKEN,
    owner: process.env.OWNER,
}
const bot = new Commando.Client({
    commandPrefix: '!',
    owner: config.owner,
});

bot.registry
    .registerDefaultTypes()
    .registerGroup('a_boothing', 'boothing group for admins')
    .registerGroup('a_activity', 'activity group for admins')
    .registerGroup('a_start_commands', 'advanced admin commands')
    .registerGroup('a_utility', 'utility commands for admins')
    .registerGroup('utility', 'utility commands for users')
    .registerGroup('verification', 'verification commands')
    .registerGroup('essentials', 'essential commands for any guild', true)
    .registerDefaultGroups()
    .registerDefaultCommands({
        unknownCommand: false,
        help: false,
    })
    .registerCommandsIn(__dirname + '/commands');

bot.once('ready', async () => {
    console.log(`Logged in as ${bot.user.tag}!`);
    bot.user.setActivity('Ready to hack!');

    await mongoUtil.mongooseConnect();

    bot.guilds.cache.forEach(async (guild, key, guilds) => {
        let botGuild = await BotGuild.findById(guild.id);

        if (!botGuild) {
            BotGuild.create({
                _id: guild.id,
            });
        }

    });
});

bot.on('guildCreate', /** @param {Commando.CommandoGuild} guild */(guild) => {
    bot.registry.groups.forEach((group, key, map) => {
        if (!group.guarded) guild.setGroupEnabled(group, false);
    });

    BotGuild.create({
        _id: guild.id,
    });
});

// Listeners for the bot

// error event
bot.on('error', (error) => {
    console.log(error)
});

bot.on('commandError', (command, error, message) => {
    console.log(
        'Error on command: ' + command.name +
        'Uncaught Rejection, reason: ' + error.name +
        '\nmessage: ' + error.message +
        '\nfile: ' + error.fileName +
        '\nline number: ' + error.lineNumber +
        '\nstack: ' + error.stack
    );

    discordServices.discordLog(message.guild,
        new Discord.MessageEmbed().setColor('#ed3434')
            .setTitle('Command Error')
            .setDescription('Error on command: ' + command.name +
                'Uncaught Rejection, reason: ' + error.name +
                '\nmessage: ' + error.message +
                '\nfile: ' + error.fileName +
                '\nline number: ' + error.lineNumber +
                '\nstack: ' + error.stack)
            .setTimestamp()
    );
});

process.on('uncaughtException', (error) => {
    console.log(
        'Uncaught Rejection, reason: ' + error.name +
        '\nmessage: ' + error.message +
        '\nfile: ' + error.fileName +
        '\nline number: ' + error.lineNumber +
        '\nstack: ' + error.stack +
        `Exception origin: ${origin}`
    );
    discordServices.discordLog(bot.guilds.cache.first(),
        new Discord.MessageEmbed().setColor('#ed3434')
            .setTitle('Uncaught Rejection')
            .setDescription('Uncaught Rejection, reason: ' + error.name +
                '\nmessage: ' + error.message +
                '\nfile: ' + error.fileName +
                '\nline number: ' + error.lineNumber +
                '\nstack: ' + error.stack +
                `\nException origin: ${origin}`)
            .setTimestamp()
    );
});

process.on('unhandledRejection', (error, promise) => {
    console.log('Unhandled Rejection at:', promise,
        'Unhandled Rejection, reason: ' + error.name +
        '\nmessage: ' + error.message +
        '\nfile: ' + error.fileName +
        '\nline number: ' + error.lineNumber +
        '\nstack: ' + error.stack
    );
    discordServices.discordLog(bot.guilds.cache.first(),
        new Discord.MessageEmbed().setColor('#ed3434')
            .setTitle('Unhandled Rejection')
            .setDescription('Unhandled Rejection, reason: ' + error.name +
                '\nmessage: ' + error.message +
                '\nfile: ' + error.fileName +
                '\nline number: ' + error.lineNumber)
            .setTimestamp()
    );
});

process.on('exit', () => {
    console.log('Node is exiting!');
    discordServices.discordLog(bot.guilds.cache.first(),
        new Discord.MessageEmbed().setColor('#ed3434')
            .setTitle('Unhandled Rejection')
            .setDescription('The program is shutting down!')
            .setTimestamp());
});

bot.on('message', async message => {
    if (message?.guild) {
        let botGuild = await BotGuild.findById(message.guild.id);

        // Deletes all messages to any channel in the black list with the specified timeout
        // this is to make sure that if the message is for the bot, it is able to get it
        // bot and staff messages are not deleted
        if (botGuild.blackList.has(message.channel.id)) {
            if (!message.author.bot && !discordServices.checkForRole(message.member, botGuild.roleIDs.staffRole)) {
                (new Promise(res => setTimeout(res, botGuild.blackList.get(message.channel.id)))).then(() => discordServices.deleteMessage(message));
            }
        }
    }


    

});

// If someone joins the server they get the guest role!
bot.on('guildMemberAdd', async member => {
    let botGuild = await BotGuild.findById(member.guild.id);
    try {
        await greetNewMember(member, botGuild);
    } catch (error) {
        await fixDMIssue(error, member, botGuild);
    }
});

bot.login(config.token).catch(console.error);


/**
 * Greets a member!
 * @param {Discord.GuildMember} member - the member to greet
 * @param {BotGuildModel} botGuild
 * @throws Error if the user has server DMs off
 */
async function greetNewMember(member, botGuild) {
    let verifyEmoji = '🍀';

    var embed = new Discord.MessageEmbed()
        .setTitle('Welcome to the cmd-f 2021 Server!')
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
                var email = (await Prompt.messagePrompt({prompt: 'What email did you get accepted with? Please send it now!', channel: member.user.dmChannel, userId: member.id}, 'string', 30)).content;
            } catch (error) {
                discordServices.sendEmbedToMember(member, {
                    title: 'Verification Error',
                    description: 'Email was not provided, please try again!'
                }, true);
                return;
            }

            try {
                Verification.verify(member, email, member.guild);
            } catch (error) {
                discordServices.sendEmbedToMember(member, {
                    title: 'Verification Error',
                    description: 'Email provided is not valid! Please try again.'
                }, true);
            }
        });
    }
    // if verification is off, then just ive member role
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
        let botGuild = await BotGuild.findById(member.guild.id);

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
                    } catch (error) {
                        member.guild.channels.resolve(channelID).send('<@' + member.id + '> Are you sure you made the changes? I couldn\'t reach you again 😕').then(msg => msg.delete({ timeout: 8000 }));
                    }
                });
            });
    } else {
        throw error;
    }
}
