const discordServices = require('../../discord-services');
const Discord = require('discord.js');
const PermissionCommand = require('../../classes/permission-command');
const Prompt = require('../../classes/prompt');
const { Document } = require('mongoose');
const ActivityManager = require('../../classes/activity-manager');

module.exports = class DistributeStamp extends PermissionCommand {
    constructor(client) {
        super(client, {
            name: 'password-stamp',
            group: 'a_activity',
            memberName: 'gives stamps requiring passwords',
            description: 'gives a stamp to everyone who reacted and gave the correct password',
            args: [
                {   key: 'activityName',
                    prompt: 'the workshop/activity name',
                    type: 'string',
                    default: '',
                },
                {
                    key: 'password',
                    prompt: 'the password for hackers to use to get stamp',
                    type: 'string',
                    default: '',
                },
                {
                    key: 'stopTime',
                    prompt: 'time for stamp collector to be open for, in minutes.',
                    type: 'integer',
                    default: 120,
                }
            ],
        }, 
        {
            channel: PermissionCommand.FLAGS.ADMIN_CONSOLE,
            channelMessage: 'This command is only available on the admin console!',
            role: PermissionCommand.FLAGS.STAFF_ROLE,
            roleMessage: 'This command can only available to staff!',
        });
    }

    /**
     * @param {Document} botGuild
     * @param {Discord.Message} message
     */
    async runCommand(botGuild, message, {activityName, password, stopTime}) {
        // helpful vars
        let channel = message.channel;
        let userId = message.author.id;
        // check if arguments have been given and prompt for the channel to use
        try {
            if (activityName === '') {
                var prompt = await Prompt.messagePrompt({prompt: 'Please respond with the workshop/activity name.', channel, userId}, 'string');
                activityName = prompt.content;
            }

            if(password === '') {
                var prompt = await Prompt.messagePrompt({prompt: 'Please respond with the password for hackers to use to get stamp.', channel, userId}, 'string');
                password = prompt.content;
            }

            var targetChannel = (await Prompt.channelPrompt({prompt: 'What channel do you want to send the stamp collector to? Users should have access to this channel!', channel, userId})).first();
        } catch (error) {
            channel.send('<@' + userId + '> Command was canceled due to prompt being canceled.').then(msg => msg.delete({timeout: 5000}));
            return;
        }

        const qEmbed = new Discord.MessageEmbed()
            .setColor(botGuild.colors.embedColor)
            .setTitle('React with anything to claim a stamp for attending ' + activityName)
            .setDescription('Once you react to this message, check for a DM from this bot. **You can only emoji this message once!**')
            .addField('A Password Is Required!', 'Through the Bot\'s DM, you will have 3 attempts in the first 60 seconds to enter the correct password.');
        
        targetChannel.send(qEmbed).then((msg) => {

            let emoji = '👍';
            msg.react(emoji);
            
            /**
             * keeps track of which users have already reacted to the message so there are no duplicates
             * @type {Discord.Collection<Discord.Snowflake, String>} - <User.id, User.username>
             */
            var seenUsers = new Discord.Collection();

            // filter emoji reaction and collector
            const emojiFilter = (reaction, user) => !user.bot && !seenUsers.has(user.id);
            const collector = msg.createReactionCollector(emojiFilter, {time: (1000 * stopTime * 60)});  // stopTime is in minutes, multiply to get seconds, then milliseconds 

            //send hacker a dm upon reaction
            collector.on('collect', async(reaction, user) => {
                seenUsers.set(user.id, user.username);

                const member = message.guild.member(user);

                // prompt member for password
                var dmMessage = await discordServices.sendEmbedToMember(user, {
                    description: "You have 60 seconds and 3 attempts to type the password correctly to get the " + activityName + " stamp.\n" +
                    "Please enter the password (leave no stray spaces or anything):",
                    title: 'Stamp Collector For ' + activityName,
                    color: '#b2ff2e',
                });

                var correctPassword = false;
                var incorrectPasswords = 0;

                const filter = m => user.id === m.author.id;
                //message collector for the user's password attempts
                const pwdCollector = dmMessage.channel.createMessageCollector(filter,{time: 60000, max: 3});

                pwdCollector.on('collect', async m => {
                    //update role and stop collecting if password matches
                    if (m.content === password) {
                        const regex = RegExp('^(\w+)\s\-\s\d{1,2}$');

                        let role = member.roles.cache.find(role => regex.test(role.name));

                        if (role != undefined) ActivityManager.parseRole(member, role, activityName);
                        correctPassword = true;
                        //discordServices.deleteMessage(msgs);
                        //discordServices.deleteMessage(dmMessage);
                        pwdCollector.stop();
                    } else if (incorrectPasswords < 2) {
                        //add 1 to number of incorrect guesses and prompts user to try again
                        await discordServices.sendMessageToMember(user, "Incorrect. Please try again.", true);
                    }
                    incorrectPasswords++;
                });
                pwdCollector.on('end', collected => {
                    discordServices.deleteMessage(dmMessage);

                    //show different messages after password collection expires depending on circumstance
                    if (!correctPassword) {
                        if (incorrectPasswords < 3) {
                            discordServices.sendEmbedToMember(user, {
                                title: 'Stamp Collector',
                                description: "Time's up! You took too long to enter the password for the " + activityName + " stamp. If you have extenuating circumstances please contact an organizer.",
                            });
                        } else {
                            discordServices.sendEmbedToMember(user, {
                                title: 'Stamp Collector',
                                description: "Incorrect. You have no attempts left for the " + activityName + " stamp. If you have extenuating circumstances please contact an organizer.",
                            });
                        }
                    }
                });
            });

            //edits the embedded message to notify people when it stops collecting reacts
            collector.on('end', collected => {
                if (msg.guild.channels.cache.find(channel => channel.name === targetChannel.name)) {
                    msg.edit(qEmbed.setTitle('Time\'s up! No more responses are being collected. Thanks for participating in ' + activityName + '\'s booth!'));
                }
            });
        });
    }
}
