const { Command } = require('@sapphire/framework');
const { MessageEmbed, Guild, Role } = require('discord.js');
const { discordLog } = require('../../discord-services');
const {
    MessageSelectMenu,
    Modal,
    TextInputComponent,
    Message,
    MessageActionRow,
    MessageButton,
    GuildBasedChannel
} = require('discord.js');
const firebaseUtil = require('../../db/firebase/firebaseUtil');
const { Client } = require('discord.js');

//TODO: allow staff to add more roles
const htmlCssEmoji = '💻';
const jsTsEmoji = '🕸️';
const pythonEmoji = '🐍';
const sqlEmoji = '🐬';
const reactEmoji = '⚛️';
const noSqlEmoji = '🔥';
const javaEmoji = '☕';
const cEmoji = '🎮';
const cSharpEmoji = '💼';
const reduxEmoji = '☁️';
const figmaEmoji = '🎨';
const unityEmoji = '🧊';
const rustEmoji = '⚙️';
const awsEmoji = '🙂';
const ideationEmoji = '💡';
const pitchingEmoji = '🎤';

let emojisMap = new Map([
    [htmlCssEmoji, 'HTML/CSS'],
    [jsTsEmoji, 'JavaScript/TypeScript'],
    [pythonEmoji, 'Python'],
    [sqlEmoji, 'SQL'],
    [reactEmoji, 'React'],
    [noSqlEmoji, 'NoSQL'],
    [javaEmoji, 'Java'],
    [cEmoji, 'C/C++'],
    [cSharpEmoji, 'C#'],
    [reduxEmoji, 'Redux'],
    [figmaEmoji, 'Figma'],
    [unityEmoji, 'Unity'],
    [rustEmoji, 'Rust'],
    [awsEmoji, 'AWS'],
    [ideationEmoji, 'Ideation'],
    [pitchingEmoji, 'Pitching']
]);

/**
 * The start mentor cave command creates a cave for mentors. To know what a cave is look at [cave]{@link Cave} class.
 * @category Commands
 * @subcategory Start-Commands
 * @extends PermissionCommand
 * @guildonly
 */
class StartMentorCave extends Command {
    constructor(context, options) {
        super(context, {
            ...options,
            description: 'Start mentor cave'
        });
    }

    registerApplicationCommands(registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName('start-mentor-cave')
                .setDescription(this.description)
                .addIntegerOption(option =>
                    option.setName('inactivity_time')
                        .setDescription('How long (minutes) before bot asks users to delete ticket channels')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('unanswered_ticket_time')
                        .setDescription('How long (minutes) shall a ticket go unaccepted before the bot sends a reminder to all mentors?')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('request_ticket_role')
                        .setDescription('Tag the role that is allowed to request tickets')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('mentor_role_selection_channel')
                        .setDescription('Tag the channel where mentors can select their specialties')
                        .setRequired(false))
                .addChannelOption(option =>
                    option.setName('incoming_tickets_channel')
                        .setDescription('Tag the channel where mentor tickets will be sent')
                        .setRequired(false))
                .addChannelOption(option =>
                    option.setName('request_ticket_channel')
                        .setDescription('Tag the channel where hackers can request tickets')
                        .setRequired(false)),
        { idHints: '1051737344937566229' });
    }

    /**
     * 
     * @param {Command.ChatInputInteraction} interaction
     */
    async chatInputRun(interaction) {
        try {
            // helpful prompt vars
            let userId = interaction.user.id;
            let guild = interaction.guild;
            this.initBotInfo = await firebaseUtil.getInitBotInfo(guild.id);

            if (!guild.members.cache.get(userId).roles.cache.has(this.initBotInfo.roleIDs.staffRole) && !guild.members.cache.get(userId).roles.cache.has(this.initBotInfo.roleIDs.adminRole)) {
                await interaction.reply({ content: 'You do not have permissions to run this command!', ephemeral: true });
                return;
            }

            // const additionalMentorRole = interaction.options.getRole('additional_mentor_role');
            const publicRole = interaction.options.getRole('request_ticket_role');
            // const bufferTime = inactivePeriod / 2;
            const reminderTime = interaction.options.getInteger('unanswered_ticket_time');

            const mentorRoleSelectionChannelId = 
                this.initBotInfo.mentorTickets?.mentorRoleSelectionChannel;
            const incomingTicketsChannelId =
                this.initBotInfo.mentorTickets?.incomingTicketsChannel;
            const requestTicketChannelId =
                this.initBotInfo.mentorTickets?.requestTicketChannel;

            const mentorRoleSelectionChannel = interaction.options.getChannel(
                'mentor_role_selection_channel'
            ) ?? (mentorRoleSelectionChannelId
                ? await guild.channels.fetch(mentorRoleSelectionChannelId)
                : null);

            const incomingTicketsChannel = interaction.options.getChannel(
                'incoming_tickets_channel'
            ) ?? (incomingTicketsChannelId
                ? await guild.channels.fetch(incomingTicketsChannelId)
                : null);

            const requestTicketChannel = interaction.options.getChannel(
                'request_ticket_channel'
            ) ?? (requestTicketChannelId
                ? await guild.channels.fetch(requestTicketChannelId)
                : null);

            if (!mentorRoleSelectionChannel || !incomingTicketsChannel || !requestTicketChannel) {
                await interaction.reply({ content: 'Please enter all 3 channels!', ephemeral: true });
                return;
            }

            if (
                mentorRoleSelectionChannel.id != mentorRoleSelectionChannelId ||
                incomingTicketsChannel.id != incomingTicketsChannelId ||
                requestTicketChannel.id != requestTicketChannelId
            ) {
                await interaction.deferReply();
                await firebaseUtil
                    .getFactotumSubCol()
                    .doc(guild.id)
                    .set({
                        mentorTickets: {
                            mentorRoleSelectionChannel: mentorRoleSelectionChannel.id,
                            incomingTicketsChannel: incomingTicketsChannel.id,
                            requestTicketChannel: requestTicketChannel.id,
                        },
                    },
                    { merge: true });
                await interaction.editReply({ content: 'Mentor cave activated!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Mentor cave activated!', ephemeral: true });
            }

            discordLog(guild, 'Mentor cave started by <@' + userId + '>');

            // these are all old code that create channels rather than using existing channels
            // let overwrites =
            //     [{
            //         id: this.botGuild.roleIDs.everyoneRole,
            //         deny: ['VIEW_CHANNEL'],
            //     },
            //     {
            //         id: this.botGuild.roleIDs.mentorRole,
            //         allow: ['VIEW_CHANNEL'],
            //     },
            //     {
            //         id: this.botGuild.roleIDs.staffRole,
            //         allow: ['VIEW_CHANNEL'],
            //     }];

            // if (additionalMentorRole) {
            //     overwrites.push({
            //         id: additionalMentorRole,
            //         allow: ['VIEW_CHANNEL']
            //     });
            // }

            // let mentorCategory = await channel.guild.channels.create('Mentors',
            //     {
            //         type: 'GUILD_CATEGORY',
            //         permissionOverwrites: overwrites
            //     }
            // );

            // let announcementsOverwrites = overwrites;
            // announcementsOverwrites.push(
            //     {
            //         id: this.botGuild.roleIDs.mentorRole,
            //         deny: ['SEND_MESSAGES'],
            //         allow: ['VIEW_CHANNEL']
            //     });

            // await channel.guild.channels.create('mentors-announcements',
            //     {
            //         type: 'GUILD_TEXT',
            //         parent: mentorCategory,
            //         permissionOverwrites: announcementsOverwrites
            //     }
            // );

            // const mentorRoleSelectionChannel = await channel.guild.channels.create('mentors-role-selection',
            //     {
            //         type: 'GUILD_TEXT',
            //         topic: 'Sign yourself up for specific roles! New roles will be added as requested, only add yourself to one if you feel comfortable responding to questions about the topic.',
            //         parent: mentorCategory
            //     }
            // );

            const mentorRoleColour = guild.roles.cache.find(role => role.id === this.initBotInfo.roleIDs.mentorRole).hexColor;
            for (let value of emojisMap.values()) {
                const findRole = guild.roles.cache.find(role => role.name.toLowerCase() === `M-${value}`.toLowerCase());
                if (!findRole) {
                    await guild.roles.create(
                        {
                            name: `M-${value}`,
                            color: mentorRoleColour,
                        }
                    );
                }
            }

            const roleSelection = makeRoleSelectionEmbed();

            /** @type {Message} */
            const roleSelectionMsg = await mentorRoleSelectionChannel.send({ embeds: [roleSelection] });
            for (const key of emojisMap.keys()) {
                roleSelectionMsg.react(key);
            }

            listenToRoleReactions(guild, roleSelectionMsg);

            const mentorCaveDoc = firebaseUtil.getSavedMessagesSubCol(guild.id).doc('mentor-cave');

            mentorCaveDoc.set({
                roleReactions: {
                    channelId: roleSelectionMsg.channelId,
                    messageId: roleSelectionMsg.id
                }
            }, {merge: true});

            // channel.guild.channels.create('mentors-general',
            //     {
            //         type: 'GUILD_TEXT',
            //         topic: 'Private chat between all mentors and organizers',
            //         parent: mentorCategory
            //     }
            // );

            // const incomingTicketChannel = await channel.guild.channels.create('incoming-tickets',
            //     {
            //         type: 'GUILD_TEXT',
            //         topic: 'Tickets from hackers will come in here!',
            //         parent: mentorCategory
            //     }
            // );

            // const mentorHelpCategory = await channel.guild.channels.create('Mentor-help',
            //     {
            //         type: 'GUILD_CATEGORY',
            //         permissionOverwrites: [
            //             {
            //                 id: this.botGuild.verification.guestRoleID,
            //                 deny: ['VIEW_CHANNEL'],
            //             },
            //         ]
            //     }
            // );

            // channel.guild.channels.create('quick-questions',
            //     {
            //         type: 'GUILD_TEXT',
            //         topic: 'ask questions for mentors here!',
            //         parent: mentorHelpCategory
            //     }
            // );

            // const requestTicketChannel = await channel.guild.channels.create('request-ticket',
            //     {
            //         type: 'GUILD_TEXT',
            //         topic: 'request 1-on-1 help from mentors here!',
            //         parent: mentorHelpCategory,
            //         permissionOverwrites: [
            //             {
            //                 id: publicRole,
            //                 allow: ['VIEW_CHANNEL'],
            //                 deny: ['SEND_MESSAGES']
            //             },
            //             {
            //                 id: this.botGuild.roleIDs.staffRole,
            //                 allow: ['VIEW_CHANNEL']
            //             },
            //             {
            //                 id: this.botGuild.roleIDs.everyoneRole,
            //                 deny: ['VIEW_CHANNEL']
            //             }
            //         ]
            //     }
            // );

            const requestTicketEmbed = new MessageEmbed()
                .setTitle('Need 1:1 mentor help?')
                .setDescription('Select a technology you need help with and follow the instructions!');

            const selectMenuRow = makeSelectMenuRow();
            
            /** @type {Message} */
            const requestTicketConsole = await requestTicketChannel.send({ embeds: [requestTicketEmbed], components: [selectMenuRow] });
            
            listenToRequestConsole(
                this.initBotInfo,
                guild,
                requestTicketConsole,
                publicRole,
                reminderTime,
                incomingTicketsChannel
            );

            mentorCaveDoc.set({
                requestTicketConsole: {
                    channelId: requestTicketConsole.channelId,
                    messageId: requestTicketConsole.id,
                    publicRoleId: publicRole.id,
                    reminderTime
                }
            }, {merge: true});

            const adminEmbed = new MessageEmbed()
                .setTitle('Mentor Cave Console')
                .setColor(this.initBotInfo.embedColor);

            const adminRow = new MessageActionRow()
                .addComponents(
                    new MessageButton()
                        .setCustomId('addRole')
                        .setLabel('Add Mentor Role')
                        .setStyle('PRIMARY'),
                );
            

            const adminConsole = await guild.channels.fetch(this.initBotInfo.channelIDs.adminConsole);

            /** @type {Message} */
            const adminControls = await adminConsole.send({ embeds: [adminEmbed], components: [adminRow] });

            listenToAdminControls(
                this.initBotInfo,
                guild,
                adminControls,
                adminConsole,
                roleSelectionMsg,
                requestTicketConsole
            );

            mentorCaveDoc.set({
                adminControls: {
                    channelId: adminControls.channelId,
                    messageId: adminControls.id,
                }
            }, {merge: true});

        } catch (error) {
            // winston.loggers.get(interaction.guild.id).warning(`An error was found but it was handled by not setting up the mentor cave. Error: ${error}`, { event: 'StartMentorCave Command' });
        }
    }

    async deleteTicketChannels(ticketText, ticketVoice, ticketCategory, ticketMsg, embed) {
        await ticketMsg.edit({ embeds: [embed] });
        ticketText.delete();
        ticketVoice.delete();
        ticketCategory.delete();
    }

    async startChannelActivityListener(ticketText, ticketVoice, ticketCategory, ticketMsg, inactivePeriod, bufferTime) {
        // message collector that stops when there are no messages for inactivePeriod minutes
        if (ticketText.parentId && ticketVoice.parentId) {
            const activityListener = ticketText.createMessageCollector({ filter: m => !m.author.bot, idle: inactivePeriod * 60 * 1000 });
            activityListener.on('end', async collected => {
                if (!ticketText.parentId || !ticketVoice.parentId) return;
                if (collected.size === 0 && ticketVoice.members.size === 0 && ticketMsg.embeds[0].color != '#90EE90') {
                    const remainingMembers = await ticketCategory.members.filter(member => !member.roles.cache.has(this.initBotInfo.roleIDs.adminRole) && !member.user.bot).map(member => member.id);
                    const msgText = '<@' + remainingMembers.join('><@') + '> Hello! I detected some inactivity in this channel. If you are done and would like to leave this ticket, please go to the pinned message and click the "Leave" button. If you would like to keep this channel a little longer, please click the button below.\n**If no action is taken in the next ' + bufferTime + ' minutes, the channels for this ticket will be deleted automatically.**';
                    const row = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId('keepChannels')
                                .setLabel('Keep Channels')
                                .setStyle('PRIMARY'),
                        );
                    const warning = await ticketText.send({ content: msgText, components: [row] });

                    warning.awaitMessageComponent({ filter: i => !i.user.bot, time: bufferTime * 60 * 1000 })
                        .then(interaction => {
                            interaction.reply('You have indicated that you need more time. I\'ll check in with you later!');
                            const disabledButtonRow = new MessageActionRow()
                                .addComponents(
                                    new MessageButton()
                                        .setCustomId('keepChannels')
                                        .setLabel('Keep Channels')
                                        .setDisabled(true)
                                        .setStyle('PRIMARY'),
                                );
                            warning.edit({ components: [disabledButtonRow] });
                            this.startChannelActivityListener(ticketText, ticketVoice, ticketCategory, ticketMsg, inactivePeriod, bufferTime);
                        })
                        .catch(() => {
                            if (!ticketText.parentId || !ticketVoice.parentId || ticketMsg.embeds[0].color == '#90EE90') return;
                            if (ticketVoice.members.size === 0) {
                                this.deleteTicketChannels(ticketText, ticketVoice, ticketCategory, ticketMsg, ticketMsg.embeds[0].setColor('#90EE90').addFields([{ name: 'Ticket closed', value: 'Deleted due to inactivity' }]));
                            } else {
                                this.startChannelActivityListener(ticketText, ticketVoice, ticketCategory, ticketMsg, inactivePeriod, bufferTime);
                            }
                        });
                } else {
                    this.startChannelActivityListener(ticketText, ticketVoice, ticketCategory, ticketMsg, inactivePeriod, bufferTime);
                }
            });
        }
    }

    /**
     * Checks Firebase for existing stored listeners -
     * restores the listeners if they exist, otherwise does nothing
     * @param {Guild} guild 
     */
    async tryRestoreReactionListeners(guild) {
        const savedMessagesSubCol = firebaseUtil.getSavedMessagesSubCol(guild.id);
        const mentorCaveDoc = await savedMessagesSubCol.doc('mentor-cave').get();
        if (!mentorCaveDoc.exists) return 'Saved messages doc for mentor cave does not exist';
        
        const mentorCaveData = mentorCaveDoc.data();
        if (mentorCaveData.extraEmojis) {
            for (const [emoji, name] of Object.entries(mentorCaveData.extraEmojis)) {
                emojisMap.set(emoji, name);
            }
        }

        // Get role reaction listener saved details
        const { 
            messageId: reactionMessageId,
            channelId: reactionChannelId
        } = mentorCaveData.roleReactions;
        const reactionChannel = await guild.channels.fetch(reactionChannelId);
        if (!reactionChannel) return 'Saved role reactions message info not found';

        // Get request ticket console saved details
        const {
            channelId: consoleChannelId,
            messageId: consoleMessageId,
            publicRoleId,
            reminderTime
        } = mentorCaveData.requestTicketConsole;
        const consoleChannel = await guild.channels.fetch(consoleChannelId);
        if (!consoleChannel) return 'Saved request ticket console info not found';

        // Get admin controls saved details
        const {
            channelId: controlsChannelId,
            messageId: controlsMessageId
        } = mentorCaveData.adminControls;
        const adminControlsChannel = await guild.channels.fetch(controlsChannelId);
        if (!adminControlsChannel) return 'Saved admin controls info not found';

        
        try {
            // Restore role reactions listener
            /** @type {Message} */
            const roleSelectionMsg = await reactionChannel.messages.fetch(reactionMessageId);
            await listenToRoleReactions(guild, roleSelectionMsg);

            // Restore request console listener
            /** @type {Message} */
            const requestTicketConsole = await consoleChannel.messages.fetch(consoleMessageId);
            const publicRole = await guild.roles.fetch(publicRoleId);
            const initBotInfo = await firebaseUtil.getInitBotInfo(guild.id);
            const incomingTicketsChannelId = initBotInfo.mentorTickets?.incomingTicketsChannel;
            const incomingTicketsChannel = await guild.channels.fetch(incomingTicketsChannelId);
            if (incomingTicketsChannelId && incomingTicketsChannel) {
                listenToRequestConsole(
                    initBotInfo,
                    guild,
                    requestTicketConsole,
                    publicRole,
                    reminderTime,
                    incomingTicketsChannel
                );
            }
            
            // Restore admin controls listener
            const adminControls = await adminControlsChannel.messages.fetch(controlsMessageId);
            const adminConsole = await guild.channels.fetch(initBotInfo.channelIDs.adminConsole);
            listenToAdminControls(
                initBotInfo,
                guild,
                adminControls,
                adminConsole,
                roleSelectionMsg,
                requestTicketConsole
            );
        } catch (e) {
            // message doesn't exist anymore
            return 'Error: ' + e;
        }
    }   
}

function makeRoleSelectionEmbed() {
    const fields = [];
    for (const [key, value] of emojisMap) {
        fields.push({ name: key + ' --> ' + value, value: '\u200b' });
    }

    const roleSelection = new MessageEmbed()
        .setTitle('Choose what you would like to help hackers with! You can un-react to deselect a role.')
        .setDescription('Note: You will be notified every time a hacker creates a ticket in one of your selected categories!')
        .addFields(fields);

    return roleSelection;
}

function makeSelectMenuRow() {
    const options = [];
    for (const value of emojisMap.values()) {
        options.push({ label: value, value: value });
    }
    options.push({ label: 'None of the above', value: 'None of the above' });

    const selectMenuRow = new MessageActionRow()
        .addComponents(
            new MessageSelectMenu()
                .setCustomId('ticketType')
                .addOptions(options)
                .setMinValues(1)
                .setMaxValues(10)
        );
    return selectMenuRow;
}

/**
 * 
 * @param {Guild} guild 
 * @param {Message} roleSelectionMsg 
 */
async function listenToRoleReactions(guild, roleSelectionMsg) {
    const collector = roleSelectionMsg.createReactionCollector({ filter: (reaction, user) => !user.bot, dispose: true });
    collector.on('collect', async (reaction, user) => {
        if (emojisMap.has(reaction.emoji.name)) {
            const value = emojisMap.get(reaction.emoji.name);
            const findRole = guild.roles.cache.find(role => role.name.toLowerCase() === `M-${value}`.toLowerCase());
            await guild.members.cache.get(user.id).roles.add(findRole);
        }
    });

    collector.on('remove', async (reaction, user) => {
        if (emojisMap.has(reaction.emoji.name)) {
            const member = guild.members.cache.get(user.id);
            const value = emojisMap.get(reaction.emoji.name);
            const findRole = member.roles.cache.find(role => role.name.toLowerCase() === `M-${value}`.toLowerCase());
            if (findRole) await guild.members.cache.get(user.id).roles.remove(findRole);
        }
    });
}

/**
 * @param {FirebaseFirestore.DocumentData | null | undefined} initBotInfo 
 * @param {Guild} guild 
 * @param {Message} requestTicketConsole 
 * @param {MessageEmbed} requestTicketEmbed 
 * @param {MessageActionRow} selectMenuRow 
 * @param {Role} publicRole 
 * @param {number} reminderTime 
 * @param {GuildBasedChannel} incomingTicketsChannel 
 */
function listenToRequestConsole(
    initBotInfo,
    guild,
    requestTicketConsole,
    publicRole,
    reminderTime,
    incomingTicketsChannel
) {
    const selectMenuFilter = i => !i.user.bot;
    const selectMenuCollector = requestTicketConsole.createMessageComponentCollector({filter: selectMenuFilter});
    selectMenuCollector.on('collect', async (i) => {
        if (i.customId === 'ticketType') {
            // requestTicketConsole.edit({ embeds: [requestTicketEmbed], components: [selectMenuRow] });
            if (!guild.members.cache.get(i.user.id).roles.cache.has(publicRole.id)) {
                await i.reply({ content: 'You do not have permissions to request tickets!', ephemeral: true });
                return;
            }
            const modal = new Modal()
                .setCustomId('ticketSubmitModal')
                .setTitle(i.values[0] === 'None of the above' ? 'Request a general mentor ticket' : 'Request a ticket for ' + i.values[0])
                .addComponents([
                    new MessageActionRow().addComponents(
                        new TextInputComponent()
                            .setCustomId('ticketDescription')
                            .setLabel('Brief description of your problem')
                            .setMaxLength(300)
                            .setStyle('PARAGRAPH')
                            .setPlaceholder('Describe your problem here')
                            .setRequired(true),
                    ),
                    new MessageActionRow().addComponents(
                        new TextInputComponent()
                            .setCustomId('location')
                            .setLabel('Where would you like to meet your mentor?')
                            .setPlaceholder('Help your mentor find you!')
                            .setMaxLength(300)
                            .setStyle('PARAGRAPH')
                            .setRequired(true),
                    )
                ]);
            await i.showModal(modal);

            const submitted = await i.awaitModalSubmit({ time: 300000, filter: j => j.user.id === i.user.id })
                .catch(() => {
                });

            if (submitted) {
                const roles = i.values.map((value) => value === 'None of the above' ? 
                    initBotInfo.roleIDs.mentorRole : 
                    guild.roles.cache.find(role => role.name.toLowerCase() === `M-${value}`.toLowerCase()).id
                );
                const description = submitted.fields.getTextInputValue('ticketDescription');
                const location = submitted.fields.getTextInputValue('location');
                // const helpFormat = submitted.fields.getTextInputValue('helpFormat');
                const mentorCaveDoc = firebaseUtil.getSavedMessagesSubCol(guild.id).doc('mentor-cave');
                const ticketNumber = (await mentorCaveDoc.get()).data()?.ticketCount ?? 1;
                await mentorCaveDoc.set({ ticketCount: ticketNumber + 1 }, { merge: true });
                const newTicketEmbed = new MessageEmbed()
                    .setTitle('Ticket #' + ticketNumber)
                    .setColor('#d3d3d3')
                    .addFields([
                        {
                            name: 'Problem description',
                            value: description
                        },
                        {
                            name: 'Where to meet',
                            value: location
                        },
                        // {
                        //     name: 'OK with being helped online?',
                        //     value: helpFormat
                        // }
                    ]);
                const ticketAcceptanceRow = new MessageActionRow()
                    .addComponents(
                        new MessageButton()
                            .setCustomId('acceptIrl')
                            .setLabel('Accept ticket (in-person)')
                            .setStyle('PRIMARY'),
                    );
                // .addComponents(
                //     new MessageButton()
                //         .setCustomId('acceptOnline')
                //         .setLabel('Accept ticket (online) - Only use if hackers are OK with it!')
                //         .setStyle('PRIMARY'),
                // );
                const rolesString = roles.map(role => `<@&${role}>`).join(', ');

                const ticketMsg = await incomingTicketsChannel.send({ content: rolesString + ', requested by <@' + submitted.user.id + '>', embeds: [newTicketEmbed], components: [ticketAcceptanceRow] });
                submitted.reply({ content: 'Your ticket has been submitted!', ephemeral: true });
                const ticketReminder = setTimeout(() => {
                    ticketMsg.reply(rolesString + ' ticket ' + ticketNumber + ' still needs help!');
                }, reminderTime * 60000);

                const confirmationEmbed = new MessageEmbed()
                    .setTitle('Your ticket is number ' + ticketNumber)
                    .addFields([
                        {
                            name: 'Problem description',
                            value: description
                        },
                        {
                            name: 'Where to meet',
                            value: location
                        }
                    ]);
                const deleteTicketRow = new MessageActionRow()
                    .addComponents(
                        new MessageButton()
                            .setCustomId('deleteTicket')
                            .setLabel('Delete ticket')
                            .setStyle('DANGER'),
                    );
                const ticketReceipt = await submitted.user.send({ embeds: [confirmationEmbed], content: 'You will be notified when a mentor accepts your ticket!', components: [deleteTicketRow] });
                const deleteTicketCollector = ticketReceipt.createMessageComponentCollector({ filter: i => !i.user.bot, max: 1 });
                deleteTicketCollector.on('collect', async deleteInteraction => {
                    await ticketMsg.edit({ embeds: [ticketMsg.embeds[0].setColor('#FFCCCB').addFields([{ name: 'Ticket closed', value: 'Deleted by hacker' }])], components: [] });
                    clearTimeout(ticketReminder);
                    deleteInteraction.reply('Ticket deleted!');
                    ticketReceipt.edit({ components: [] });
                });

                const ticketAcceptFilter = i => !i.user.bot && i.isButton();
                const ticketAcceptanceCollector = ticketMsg.createMessageComponentCollector({ filter: ticketAcceptFilter });
                ticketAcceptanceCollector.on('collect', async acceptInteraction => {
                    const inProgressTicketEmbed = ticketMsg.embeds[0].setColor('#0096FF').addFields([{ name: 'Helped by:', value: '<@' + acceptInteraction.user.id + '>' }]);
                    if (acceptInteraction.customId === 'acceptIrl' || acceptInteraction.customId === 'acceptOnline') {
                        await ticketReceipt.edit({ components: [] });
                        clearTimeout(ticketReminder);
                        ticketMsg.edit({ embeds: [inProgressTicketEmbed], components: [] });
                    }
                    if (acceptInteraction.customId === 'acceptIrl') {
                        // TODO: mark as complete?
                        submitted.user.send('Your ticket number ' + ticketNumber + ' has been accepted by a mentor! They will be making their way to you shortly.');
                        acceptInteraction.reply({ content: 'Thanks for accepting their ticket! Please head to their stated location. If you need to contact them, you can click on their username above to DM them!', ephemeral: true });
                    }
                    // if (acceptInteraction.customId === 'acceptOnline') {
                    //     submitted.user.send('Your ticket number ' + ticketNumber + ' has been accepted by a mentor! You should have gotten a ping from a new private channel. You can talk to your mentor there!');
                    //     acceptInteraction.reply({ content: 'Thanks for accepting their ticket! You should get a ping from a private channel for this ticket! You can help them there.', ephemeral: true });
                    //     let ticketChannelOverwrites =
                    //         [{
                    //             id: this.botGuild.roleIDs.everyoneRole,
                    //             deny: ['VIEW_CHANNEL'],
                    //         },
                    //         {
                    //             id: acceptInteraction.user.id,
                    //             allow: ['VIEW_CHANNEL'],
                    //         },
                    //         {
                    //             id: submitted.user.id,
                    //             allow: ['VIEW_CHANNEL'],
                    //         }];

                    //     let ticketCategory = await channel.guild.channels.create('Ticket-#' + ticketNumber,
                    //         {
                    //             type: 'GUILD_CATEGORY',
                    //             permissionOverwrites: ticketChannelOverwrites
                    //         }
                    //     );

                    //     const ticketText = await channel.guild.channels.create('ticket-' + ticketNumber,
                    //         {
                    //             type: 'GUILD_TEXT',
                    //             parent: ticketCategory
                    //         }
                    //     );

                    //     const ticketVoice = await channel.guild.channels.create('ticket-' + ticketNumber + '-voice',
                    //         {
                    //             type: 'GUILD_VOICE',
                    //             parent: ticketCategory
                    //         }
                    //     );

                    //     const ticketChannelEmbed = new MessageEmbed()
                    //         .setColor(this.botGuild.colors.embedColor)
                    //         .setTitle('Ticket description')
                    //         .setDescription(submitted.fields.getTextInputValue('ticketDescription'));

                    //     const ticketChannelButtons = new MessageActionRow()
                    //         .addComponents(
                    //             new MessageButton()
                    //                 .setCustomId('addMembers')
                    //                 .setLabel('Add Members to Channels')
                    //                 .setStyle('PRIMARY'),
                    //         )
                    //         .addComponents(
                    //             new MessageButton()
                    //                 .setCustomId('leaveTicket')
                    //                 .setLabel('Leave')
                    //                 .setStyle('DANGER'),
                    //         );
                    //     const ticketChannelInfoMsg = await ticketText.send({ content: `<@${acceptInteraction.user.id}><@${submitted.user.id}> These are your very own private channels! It is only visible to the admins of the server and any other users (i.e. teammates) you add to this channel with the button labeled "Add Members to Channels" below ⬇️. Feel free to discuss anything in this channel or the attached voice channel. **Please click the "Leave" button below when you are done to leave these channels**\n\n**Note: these channels may be deleted if they appear to be inactive for a significant period of time, even if not everyone has left**`, embeds: [ticketChannelEmbed], components: [ticketChannelButtons] });
                    //     ticketChannelInfoMsg.pin();

                    //     const ticketChannelCollector = ticketChannelInfoMsg.createMessageComponentCollector({ filter: notBotFilter });
                    //     ticketChannelCollector.on('collect', async ticketInteraction => {
                    //         if (ticketInteraction.customId === 'addMembers') {
                    //             ticketInteraction.reply({ content: 'Tag the users you would like to add to the channel! (You can mention them by typing @ and then paste in their username with the tag)', ephemeral: true, fetchReply: true })
                    //                 .then(() => {
                    //                     const awaitMessageFilter = i => i.user.id === ticketInteraction.user.id;
                    //                     ticketInteraction.channel.awaitMessages({ awaitMessageFilter, max: 1, time: 60000, errors: ['time'] })
                    //                         .then(async collected => {
                    //                             if (collected.first().mentions.members.size === 0) {
                    //                                 await ticketInteraction.followUp({ content: 'You have not mentioned any users! Click the button again to try again.' });
                    //                             } else {
                    //                                 var newMembersArray = [];
                    //                                 collected.first().mentions.members.forEach(member => {
                    //                                     ticketCategory.permissionOverwrites.edit(member.id, { VIEW_CHANNEL: true });
                    //                                     newMembersArray.push(member.id);
                    //                                 });
                    //                                 ticketInteraction.channel.send('<@' + newMembersArray.join('><@') + '> Welcome to the channel! You have been invited to join the discussion for this ticket. Check the pinned message for more details.');
                    //                             }
                    //                         })
                    //                         .catch(collected => {
                    //                             ticketInteraction.followUp({ content: 'Timed out. Click the button again to try again.', ephemeral: true });
                    //                         });
                    //                 });
                    //         } else if (ticketInteraction.customId === 'leaveTicket' && guild.members.cache.get(ticketInteraction.user.id).roles.cache.has(this.botGuild.roleIDs.adminRole) ) {
                    //             await ticketCategory.permissionOverwrites.edit(ticketInteraction.user.id, { VIEW_CHANNEL: false });
                    //             ticketInteraction.reply({ content: 'Successfully left the channel!', ephemeral: true });
                    //             if (ticketCategory.members.filter(member => !member.roles.cache.has(this.botGuild.roleIDs.adminRole) && !member.user.bot).size === 0) {
                    //                 const leftTicketEmbed = ticketMsg.embeds[0].setColor('#90EE90').addFields([{ name: 'Ticket closed', value: 'Everyone has left the ticket' }]);
                    //                 await this.deleteTicketChannels(ticketText, ticketVoice, ticketCategory, ticketMsg, leftTicketEmbed);
                    //             }
                    //         } else {
                    //             ticketInteraction.reply({ content: 'You are an admin, you cannot leave this channel!', ephemeral: true });
                    //         }
                    //     });
                    //     this.startChannelActivityListener(ticketText, ticketVoice, ticketCategory, ticketMsg, inactivePeriod, bufferTime);
                    // }
                });
            }

        }
    });
}

/**
 * @param {FirebaseFirestore.DocumentData | null | undefined} initBotInfo 
 * @param {Guild} guild 
 * @param {Message} adminControls 
 * @param {GuildBasedChannel} adminConsole
 * @param {Message} roleSelectionMsg
 * @param {Message} requestTicketConsole 
 */
function listenToAdminControls(
    initBotInfo,
    guild,
    adminControls,
    adminConsole,
    roleSelectionMsg,
    requestTicketConsole
) {
    const mentorRoleColour = guild.roles.cache.find(role => role.id === initBotInfo.roleIDs.mentorRole).hexColor;
    const adminCollector = adminControls.createMessageComponentCollector({ filter: i => !i.user.bot && i.member.roles.cache.has(initBotInfo.roleIDs.adminRole) });
    adminCollector.on('collect', async (adminInteraction) => {
        if (adminInteraction.customId === 'addRole') {
            const askForRoleName = await adminInteraction.reply({ content: `<@${adminInteraction.user.id}> name of role to add? Type "cancel" to cancel this operation.`, fetchReply: true });
            const roleNameCollector = adminConsole.createMessageCollector({ filter: m => m.author.id === adminInteraction.user.id, max: 1 });
            let roleName;
            roleNameCollector.on('collect', async collected => {
                if (collected.content.toLowerCase() != 'cancel') {
                    roleName = collected.content.replace(/\s+/g, '-').toLowerCase();
                    const roleExists = guild.roles.cache.filter(role => {
                        role.name === `M-${roleName}`;
                    }).size != 0;
                    if (!roleExists) {
                        await guild.roles.create(
                            {
                                name: `M-${roleName}`,
                                color: mentorRoleColour,
                            }
                        );
                    }

                    const askForEmoji = await adminConsole.send(`<@${adminInteraction.user.id}> React to this message with the emoji for the role!`);
                    const emojiCollector = askForEmoji.createReactionCollector({ filter: (reaction, user) => user.id === adminInteraction.user.id });
                    emojiCollector.on('collect', (collected) => {
                        if (emojisMap.has(collected.emoji.name)) {
                            adminConsole.send(`<@${adminInteraction.user.id}> Emoji is already used in another role. Please react again.`).then(msg => {
                                setTimeout(() => msg.delete(), 5000);
                            });
                        } else {
                            emojiCollector.stop();
                            firebaseUtil.getSavedMessagesSubCol(guild.id).doc('mentor-cave').set({
                                extraEmojis: {
                                    [collected.emoji.name]: roleName
                                }
                            }, { merge: true });
                            emojisMap.set(collected.emoji.name, roleName);
                            adminConsole.send(`<@${adminInteraction.user.id}> Role added!`).then(msg => {
                                setTimeout(() => msg.delete(), 5000);
                            });
                            roleSelectionMsg.edit({ embeds: [new MessageEmbed(makeRoleSelectionEmbed())] });
                            roleSelectionMsg.react(collected.emoji.name);

                            const selectMenuOptions = makeSelectMenuRow().components[0].options;
                            const newSelectMenuRow =
                              new MessageActionRow().addComponents(
                                  new MessageSelectMenu()
                                      .setCustomId('ticketType')
                                      .addOptions(selectMenuOptions)
                              );
                            requestTicketConsole.edit({ components: [newSelectMenuRow] });
                            askForEmoji.delete();
                        }
                    });
                }
                askForRoleName.delete();
                collected.delete();

            });
        }
    });
}

module.exports = StartMentorCave;