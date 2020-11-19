// Discord.js commando requirements
const { Command } = require('discord.js-commando');
const firebaseActivity = require('../../firebase-services/firebase-services-activities');
const discordServices = require('../../discord-services');
const Discord = require('discord.js');

// Command export
module.exports = class StartMentors extends Command {
    constructor(client) {
        super(client, {
            name: 'startm',
            group: 'a_mentors',
            memberName: 'start the mentor\'s experience',
            description: 'Will create a private category for mentors with channels for them to use!',
            guildOnly: true,
            args: [],
        });
    }

    // Run function -> command body
    async run(message) {
        discordServices.deleteMessage(message);
        // make sure command is only used in the admin console
        if (discordServices.isAdminConsole(message.channel) === true) {
            // only memebers with the Hacker tag can run this command!
            if ((await discordServices.checkForRole(message.member, discordServices.adminRole))) {
                // ask if they have a mentor category already created! TODO


                // check if mentor cave category has not been already created!
                var possibleMentorCaveCategorys = await message.guild.channels.cache.filter((channel => channel.type === 'category' && channel.name === 'Mentors Cave'));

                if (possibleMentorCaveCategorys.array().length === 0) {
                    // Create category
                    var mentorCaveCategory = await message.guild.channels.create('Mentors Cave', {type: 'category',  permissionOverwrites: [
                        {
                            id: discordServices.hackerRole,
                            deny: ['VIEW_CHANNEL'],
                        },
                        {
                            id: discordServices.attendeeRole,
                            deny: ['VIEW_CHANNEL'],
                        },
                        {
                            id: discordServices.mentorRole,
                            allow: ['VIEW_CHANNEL'],
                        },
                        {
                            id: discordServices.sponsorRole,
                            deny: ['VIEW_CHANNEL'],
                        },
                        {
                            id: discordServices.staffRole,
                            allow: ['VIEW_CHANNEL'],
                        }
                    ]});

                    // general text channel to talk
                    message.guild.channels.create('mentor-banter', {type: 'text', parent: mentorCaveCategory});

                    // mentor console channel to ask for tags
                    var mentorConsole = await message.guild.channels.create('mentor-console', {type: 'text', parent: mentorCaveCategory});

                    // create a couple of voice channels for mentors to use
                    for (var i = 0; i < 3; i++) {
                        message.guild.channels.create('Room ' + i, {type: 'voice', parent: mentorCaveCategory});
                    }

                    // create mentor help public channels category
                    var publicHelpCategory = await message.guild.channels.create('Mentor Help', {type: 'category', permissionOverwrites: [
                        {
                            id: discordServices.hackerRole,
                            deny: ['VIEW_CHANNEL'],
                        },
                        {
                            id: discordServices.attendeeRole,
                            allow: ['VIEW_CHANNEL'],
                        },
                        {
                            id: discordServices.mentorRole,
                            allow: ['VIEW_CHANNEL'],
                        },
                        {
                            id: discordServices.sponsorRole,
                            allow: ['VIEW_CHANNEL'],
                        },
                        {
                            id: discordServices.staffRole,
                            allow: ['VIEW_CHANNEL'],
                        }
                    ]});

                    // report success of activity creation
                    discordServices.replyAndDelete(message,'The mentor cateogry has been create succesfully!');
                } else {
                    discordServices.replyAndDelete(message, 'A mentor cave has been found, nothing created!');
                    var mentorCaveCategory = possibleMentorCaveCategorys.first();
                    var mentorConsole = mentorCaveCategory.children.find(channel => channel.name === 'mentor-console');
                    // remove messages in mentor console
                    mentorConsole.bulkDelete(100, true);
                    var publicHelpCategory = await message.guild.channels.cache.find((channel => channel.type === 'category' && channel.name === 'Mentor Help'));
                }

                // if we couldnt find the mentor console channel ask for the name of the channel!   
                if (mentorConsole === undefined) {
                    return;
                    // TODO ask for name of channel and fetch it
                }

                
                

                ////// send message to admin console
                // message embed
                const msgEmbed = new Discord.MessageEmbed()
                    .setColor(discordServices.embedColor)
                    .setTitle('Mentor Cateogry Console')
                    .setDescription('Mentor category options are found below.')
                    .addField('Add a mentor role', 'To add a mentor role please click the 🧠 emoji.');

                // send message
                var msgConsole = await message.channel.send(msgEmbed);

                // emojis
                var adminEmojis = ['🧠'];

                // respond to message with emojis
                adminEmojis.forEach(emoji => msgConsole.react(emoji));


                ////// send message to mentor console
                // embed for mentor console
                const mentorEmbed = new Discord.MessageEmbed()
                    .setColor(discordServices.embedColor)
                    .setTitle('Mentor Role Console')
                    .setDescription('Hi mentor! Thank you for being here, please read over all the available roles. And choose those you would feel ' + 
                    'confortable answering questions for. When someone sends in a help ticket, and has specificed one of your roles, you will get pinged!');

                // mentor emojis with title, we will use a map, 
                // key :  emoji name, 
                // value : [role name, role snowflake, role wait list message id]
                var mentorEmojis = new Map();
                
                // loop over all the mentor emojis and add a field explaining each
                mentorEmojis.forEach((value, key) => {
                    mentorEmbed.addField(value[0], 'Click the ' + key + ' emoji!');
                });

                // send message
                var mentorConsoleMsg = await mentorConsole.send(mentorEmbed);

                // react to the message with all the emojis
                mentorEmojis.forEach((value, key) => {
                    mentorConsoleMsg.react(key);
                });


                ////// check for excisting mentor roles that start with M-
                var roleMan = await message.guild.roles.fetch();

                var initialMentorRoles = await roleMan.cache.filter(role => role.name.startsWith('M-'));
                
                if (initialMentorRoles.array().length != 0) {
                    // let user know we found roles
                    message.channel.send('<@' + message.author.id + '> I have found Mentor roles already clreated, please react to each role with the corresponding emoji!').then(msg => msg.delete({timeout: 8000}));
                }

                // for each found role, ask what emoji they want to use for it!
                await initialMentorRoles.each(async role => {
                    var getInitialEmojiMsg = await message.channel.send('<@' + message.author.id + '> React with emoji for role named: ' + role.name);
                
                    const reactionFilter = (reaction, user) => user.id === message.author.id && !mentorEmojis.has(reaction.emoji.name);

                    getInitialEmojiMsg.awaitReactions(reactionFilter, {max: 1}).then(reactions => {
                        var reaction = reactions.first();

                        // update mentor message
                        mentorConsoleMsg.edit(mentorConsoleMsg.embeds[0].addField(role.name.substring(2), 'Click the ' + reaction.emoji.name + ' emoji!'));

                        // react to message
                        mentorConsoleMsg.react(reaction.emoji.name);

                        // add emoji to list with role name, role id and waitlist message id
                        mentorEmojis.set(reaction.emoji.name, [role.name.substring(2), role.id, waitlist.id]);

                        // remove msgs
                        getInitialEmojiMsg.delete();
                    })
                });


                ///// admin console collector
                // filter
                const emojiFilter = (reaction, user) => user.bot != true && adminEmojis.includes(reaction.emoji.name);

                // create collector
                const emojiCollector = await msgConsole.createReactionCollector(emojiFilter);

                // on emoji reaction
                emojiCollector.on('collect', async (reaction, user) => {
                    // remove reaction
                    reaction.users.remove(user.id);

                    // ask for role name, we will add TA- at the beginning
                    var roleNameMsg = await message.channel.send('<@' + user.id + '> What is the name of this new role? Do not add M-, I will add that already!');

                    const roleNameFilter = m => m.author.id === user.id;

                    message.channel.awaitMessages(roleNameFilter, {max: 1}).then(msgs => {
                        var nameMsg = msgs.first();

                        message.channel.send('<@' + user.id + '> Please react to this message with the associated emoji!').then(msg => {
                            const emojiFilter = (r, u) => u.id === user.id;

                            msg.awaitReactions(emojiFilter, {max: 1}).then(async rcs => {
                                var reaction = rcs.first();

                                // make sure the emoji is not in use already!
                                if (mentorEmojis.has(reaction.emoji.name)) {
                                    message.channel.send('<@' + user.id + '> This emoji is already in play! Please try again!').then(msg => msg.delete({timeout: 5000}));
                                } else {
                                    // add role to mentor embed
                                    // update embed
                                    mentorConsoleMsg.edit(mentorConsoleMsg.embeds[0].addField(nameMsg.content, 'Click the ' + reaction.emoji.name + ' emoji!'));
                                    mentorConsoleMsg.react(reaction.emoji.name);

                                    // add role to server
                                    var newRole = await message.guild.roles.create({
                                        data: {
                                            name: 'M-' + nameMsg.content,
                                            color: 'ORANGE',
                                        }
                                    });

                                    // add new role and emoji to list
                                    mentorEmojis.set(reaction.emoji.name, [nameMsg.content, newRole.id]);

                                    // add public text channel
                                    message.guild.channels.create(nameMsg.content + '-help', {type: 'text', parent: publicHelpCategory});

                                    // let user know the action was succesfull
                                    message.channel.send('<@' + user.id + '> The role has been added!').then(msg => msg.delete({timeout: 5000}));
                                }
                                
                                // delete all messages involved with this process
                                roleNameMsg.delete();
                                nameMsg.delete();
                                msg.delete();
                            });
                        });
                    });
                });

                ////// mentor collector
                // filter and collector
                const mentorFilter = (reaction, user) => user.bot === false && mentorEmojis.has(reaction.emoji.name);

                const mentorCollector = mentorConsoleMsg.createReactionCollector(mentorFilter);

                mentorCollector.on('collect', async (reaction, user) => {
                    // member
                    var mbr = await message.guild.members.fetch(user.id);
                    // role
                    var role = await message.guild.roles.fetch(mentorEmojis.get(reaction.emoji.name)[1]);

                    discordServices.addRoleToMember(mbr, role);

                    mentorConsole.send('<@' + user.id + '> You have been granted the ' + mentorEmojis.get(reaction.emoji.name)[0] + ' role!');
                });

            } else {
                discordServices.replyAndDelete(message, 'You do not have permision for this command, only admins can use it!');
            }
        } else {
            discordServices.replyAndDelete(message, 'This command can only be used in the admin console!');
        }
    }

};