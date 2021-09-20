const { Collection, TextChannel, Role, MessageEmbed, CategoryChannel, Guild } = require('discord.js');
const { CommandoClient, CommandoGuild } = require('discord.js-commando');
const winston = require('winston');
const discordServices = require('../../discord-services');

/**
 * @class
 */
class BotGuild {

    
    /**
     * Staff role permissions.
     * @type {String[]}
     */
    static staffPermissions = ['VIEW_CHANNEL', 'MANAGE_EMOJIS', 'CHANGE_NICKNAME', 'MANAGE_NICKNAMES', 
    'KICK_MEMBERS', 'BAN_MEMBERS', 'SEND_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES', 'ADD_REACTIONS', 'USE_EXTERNAL_EMOJIS', 'MANAGE_MESSAGES', 
    'READ_MESSAGE_HISTORY', 'CONNECT', 'STREAM', 'SPEAK', 'PRIORITY_SPEAKER', 'USE_VAD', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS', 'MOVE_MEMBERS'];

    /**
     * Admin role permissions.
     * @type {String[]}
     */
    static adminPermissions = ['ADMINISTRATOR'];

    /**
     * The regular member perms.
     * @type {String[]}
     */
    static memberPermissions = ['VIEW_CHANNEL', 'CHANGE_NICKNAME', 'SEND_MESSAGES', 'ADD_REACTIONS', 'READ_MESSAGE_HISTORY',
    'CONNECT', 'SPEAK', 'STREAM', 'USE_VAD'];

    /**
     * @typedef RoleIDs
     * @property {String} memberRole - regular guild member role ID
     * @property {String} staffRole - the staff role ID
     * @property {String} adminRole - the admin role ID
     * @property {String} everyoneRole - the everyone role ID
     */

     /**
      * @typedef ChannelIDs
      * @property {String} adminConsole - the admin console channel ID
      * @property {String} adminLog - the admin log channel ID
      * @property {String} botSupportChannel - the bot support channel ID
      */

    /**
     * @typedef VerificationInfo
     * @property {Boolean} isEnabled - true if verification is enabled
     * @property {String} isVerifiedRoleID - the verified role ID that holds basic permissions
     * @property {String[]} isVerifiedRolePermissions - the permissions for the isVerified role
     * @property {String} guestRoleID - the guest role ID used for verification
     * @property {String} welcomeChannelID -  the welcome channel where users learn to verify
     * @property {String} welcomeSupportChannelID - the support channel where the bot can contact users
     */

    /**
     * @typedef AttendanceInfo
     * @property {Boolean} isEnabled - true if attendance is enabled in this guild
     * @property {String} attendeeRoleID - the attendee role ID used for attendance
     */

    /**
     * @typedef StampInfo
     * @property {Boolean} isEnabled - true if stamps are enabled
     * @property {Collection<Number, String>} stampRoleIDs - <StampNumber, roleID>
     * @property {Number} stampCollectionTime - time given to users to collect password stamps
     */

    /**
     * @typedef ReportInfo
     * @property {Boolean} isEnabled - true if the report functionality is enabled
     * @property {String} incomingReportChannelID - channel where reports are sent
     */

    /**
     * @typedef AnnouncementInfo
     * @property {Boolean} isEnabled
     * @property {String} announcementChannelID
     */

    /**
     * @typedef BotGuildInfo
     * @property {RoleIDs} roleIDs
     * @property {ChannelIDs} channelIDs
     */

    /**
     * Validate the information.
     * @param {BotGuildInfo} botGuildInfo - the information to validate
     * @throws Error if the botGuildInfo is incomplete
     */
    validateBotGuildInfo(botGuildInfo) {
        if (typeof botGuildInfo != 'object') throw new Error('The bot guild information is required!');
        if (!botGuildInfo?.roleIDs || !botGuildInfo?.roleIDs?.adminRole || !botGuildInfo?.roleIDs?.everyoneRole
            || !botGuildInfo?.roleIDs?.memberRole || !botGuildInfo?.roleIDs?.staffRole) throw new Error('All the role IDs are required!');
        if (!botGuildInfo?.channelIDs || !botGuildInfo?.channelIDs?.adminConsole || !botGuildInfo?.channelIDs?.adminLog
            || !botGuildInfo?.channelIDs?.botSupportChannel) throw new Error('All the channel IDs are required!');
    }

    /**
     * Will set the minimum required information for the bot to work on this guild.
     * @param {BotGuildInfo} botGuildInfo 
     * @param {CommandoClient} client
     * @returns {Promise<BotGuild>}
     * @async
     */
    async readyUp(client, botGuildInfo) {
        this.validateBotGuildInfo(botGuildInfo);

        this.roleIDs = botGuildInfo.roleIDs;
        this.channelIDs = botGuildInfo.channelIDs;

        let guild = await client.guilds.fetch(this._id);

        let adminRole = await guild.roles.fetch(this.roleIDs.adminRole);
        // try giving the admins administrator perms
        try {
            if (!adminRole.permissions.has('ADMINISTRATOR')) 
            {
                adminRole.setPermissions(adminRole.permissions.add(['ADMINISTRATOR']));
                await adminRole.setMentionable(true);
            }
        } catch {
            discordServices.discordLog(guild, 'Was not able to give administrator privileges to the role <@&' + adminRole.id + '>. Please help me!')
        }

        // staff role set up
        let staffRole = await guild.roles.fetch(this.roleIDs.staffRole);
        staffRole.setMentionable(true);
        staffRole.setHoist(true);
        staffRole.setPermissions(staffRole.permissions.add(BotGuild.staffPermissions));

        // regular member role setup
        let memberRole = await guild.roles.fetch(this.roleIDs.memberRole);
        memberRole.setMentionable(false);
        memberRole.setPermissions(memberRole.permissions.add(BotGuild.memberPermissions));

        // change the everyone role permissions, we do this so that we can lock rooms. For users to see the server when 
        // verification is off, they need to get the member role when greeted by the bot!
        guild.roles.everyone.setPermissions(0); // no permissions for anything like the guest role

        // create the archive category
        this.channelIDs.archiveCategory = (await this.createArchiveCategory(guild)).id;

        this.isSetUpComplete = true;

        winston.loggers.get(this._id).event(`The botGuild has run the ready up function.`, {event: "Bot Guild"});

        return this;
    }

    /**
     * Creates the archive category.
     * @returns {Promise<CategoryChannel>}
     * @param {Guild} guild
     * @private
     * @async
     */
    async createArchiveCategory(guild) {
        let overwrites = [
            {
                id: this.roleIDs.everyoneRole,
                deny: ['VIEW_CHANNEL']
            },
            {
                id: this.roleIDs.memberRole,
                allow: ['VIEW_CHANNEL'],
            },
            {
                id: this.roleIDs.staffRole,
                allow: ['VIEW_CHANNEL'],
            }
        ];

        // position is used to create archive at the very bottom!
        var position = (guild.channels.cache.filter(channel => channel.type === 'category')).size;
        return await guild.channels.create('💼archive', {
            type: 'category', 
            position: position + 1,
            permissionOverwrites: overwrites,
        });
    }

    /**
     * Will create the admin channels with the correct roles.
     * @param {Guild} guild 
     * @param {Role} adminRole 
     * @param {Role} everyoneRole 
     * @returns {Promise<{TextChannel, TextChannel}>} - {Admin Console, Admin Log Channel}
     * @static
     * @async
     */
    static async createAdminChannels(guild, adminRole, everyoneRole) {
        let adminCategory = await guild.channels.create('Admins', {
            type: 'category',
            permissionOverwrites: [
                {
                    id: adminRole.id,
                    allow: 'VIEW_CHANNEL'
                },
                {
                    id: everyoneRole.id,
                    deny: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'CONNECT']
                }
            ]
        });

        let adminConsoleChannel = await guild.channels.create('console', {
            type: 'text',
            parent: adminCategory,
        });

        let adminLogChannel = await guild.channels.create('logs', {
            type: 'text',
            parent: adminCategory,
        });

        adminCategory.children.forEach(channel => channel.lockPermissions());

        winston.loggers.get(guild.id).event(`The botGuild has run the create admin channels function.`, {event: "Bot Guild"});

        return {adminConsoleChannel: adminConsoleChannel, adminLog: adminLogChannel};
    }

    /**
     * @typedef VerificationChannels
     * @property {String} welcomeChannelID
     * @property {String} welcomeChannelSupportID
     */

    /**
     * @typedef TypeInfo
     * @property {String} type
     * @property {String} roleId
     */

    /**
     * Will set up the verification process.
     * @param {CommandoClient} client 
     * @param {String} guestRoleId
     * @param {TypeInfo[]} types
     * @param {VerificationChannels} [verificationChannels]
     * @return {Promise<BotGuild>}
     * @async
     */
    async setUpVerification(client, guestRoleId, types, verificationChannels = null) {
        /** @type {CommandoGuild} */
        let guild = await client.guilds.fetch(this._id);

        try {
            var guestRole = await guild.roles.fetch(guestRoleId);
        } catch (error) {
            throw new Error('The given guest role ID is not valid for this guild!');
        }
        guestRole.setMentionable(false);
        guestRole.setPermissions(0);
        this.verification.guestRoleID = guestRoleId;

        if (verificationChannels) {
            this.verification.welcomeChannelID = verificationChannels.welcomeChannelID;
            this.verification.welcomeSupportChannelID = verificationChannels.welcomeChannelSupportID;

            /** @type {TextChannel} */
            var welcomeChannel = guild.channels.resolve(this.verification.welcomeChannelID);
            await welcomeChannel.bulkDelete(100, true);
        } else {
            let welcomeCategory = await guild.channels.create('Welcome', {
                type: 'category',
                permissionOverwrites: [
                    {
                        id: this.roleIDs.everyoneRole,
                        allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY']
                    },
                    {
                        id: this.roleIDs.memberRole,
                        deny: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY']
                    },
                ],
            });
    
            var welcomeChannel = await guild.channels.create('welcome', {
                type: 'text',
                parent: welcomeCategory,
            });
    
            // update welcome channel to not send messages
            welcomeChannel.updateOverwrite(this.roleIDs.everyoneRole, {
                SEND_MESSAGES: false,
            });
    
            let welcomeChannelSupport = await guild.channels.create('welcome-support', {
                type: 'text',
                parent: welcomeCategory,
            });

            this.verification.welcomeChannelID = welcomeChannel.id;
            this.verification.welcomeSupportChannelID = welcomeChannelSupport.id;
        }

        // add the types to the type map.
        types.forEach((type, index, list) => {
            this.verification.verificationRoles.set(type.type.toLowerCase(), type.roleId);
        });

        const embed = new MessageEmbed().setTitle('Welcome to the ' + guild.name + ' Discord server!')
            .setDescription('In order to verify that you have registered for ' + guild.name + ', please respond to the bot (me) via DM!')
            .addField('Do you need assistance?', 'Head over to the welcome-support channel and ping the admins!')
            .setColor(this.colors.embedColor);
        welcomeChannel.send(embed).then(msg => msg.pin());

        
        this.verification.isEnabled = true;
        guild.setCommandEnabled('verify', true);

        winston.loggers.get(this._id).event(`The botGuild has set up the verification system. Verification channels ${verificationChannels === null ? 'were created' : 'were given'}. 
            Guest role id: ${guestRoleId}. The types used are: ${types.join()}`, {event: "Bot Guild"});
        return this;
    }

    /**
     * Sets up the attendance functionality.
     * @param {CommandoClient} client 
     * @param {String} attendeeRoleID
     * @returns {Promise<BotGuild>}
     * @async
     */
    async setUpAttendance(client, attendeeRoleID) {
        this.attendance.attendeeRoleID = attendeeRoleID;
        this.attendance.isEnabled = true;
        /** @type {CommandoGuild} */
        let guild = await client.guilds.fetch(this._id);
        guild.setCommandEnabled('start-attend', true);
        guild.setCommandEnabled('attend', true);

        winston.loggers.get(this._id).event(`The botGuild has set up the attendance functionality. Attendee role id is ${attendeeRoleID}`, {event: "Bot Guild"});
        return this;
    }

    /**
     * Will set up the firebase announcements.
     * @param {CommandoClient} client 
     * @param {String} announcementChannelID
     * @async
     */
    async setUpAnnouncements(client, announcementChannelID) {
        /** @type {CommandoGuild} */
        let guild = await client.guilds.fetch(this._id);
        
        let announcementChannel = guild.channels.resolve(announcementChannelID);
        if (!announcementChannel) throw new Error('The announcement channel ID is not valid for this guild!');

        this.announcement.isEnabled = true;
        this.announcement.announcementChannelID = announcementChannelID;

        winston.loggers.get(this._id).event(`The botGuild has set up the announcement functionality with the channel ID ${announcementChannelID}`, {event: "Bot Guild"});

        // TODO Firebase setup 
        // start query listener for announcements
        // nwFirebase.firestore().collection('Hackathons').doc('nwHacks2021').collection('Announcements').onSnapshot(querySnapshot => {
        //     // exit if we are at the initial state
        //     if (isInitState) {
        //         isInitState = false;
        //         return;
        //     }

        //     querySnapshot.docChanges().forEach(change => {
        //         if (change.type === 'added') {
        //             const embed = new Discord.MessageEmbed()
        //                 .setColor(botGuild.colors.announcementEmbedColor)
        //                 .setTitle('Announcement')
        //                 .setDescription(change.doc.data()['content']);

        //             announcementChannel.send('<@&' + discordServices.roleIDs.attendeeRole + '>', { embed: embed });
        //         }
        //     });
        // });
    }

    /**
     * Creates the stamps roles and adds them to this BotGuild. If stamps roles are given 
     * then no roles are created!
     * @param {CommandoClient} client 
     * @param {Number} [stampAmount] - amount of stamps to create
     * @param {Number} [stampCollectionTime] - time given to users to send password to get stamp
     * @param {String[]} [stampRoleIDs] - current stamp roles to use
     * @returns {Promise<BotGuild>}
     * @async
     */
    async setUpStamps(client, stampAmount = 0, stampCollectionTime = 60, stampRoleIDs = []) {
        let guild = await client.guilds.fetch(this._id);

        if (stampRoleIDs.length > 0) {
            stampRoleIDs.forEach((ID, index, array) => {
                this.addStamp(ID, index);
            });
            winston.loggers.get(this._id).event(`The botGuild has set up the stamp functionality. The stamp roles were given. Stamp collection time is set at ${stampCollectionTime}.` [{stampIds: stampRoleIDs}]);
        } else {
            for (let i = 0; i < stampAmount; i++) {
                let role = await guild.roles.create({
                    data: {
                        name: 'Stamp Role #' + i,
                        hoist: true,
                        color: discordServices.randomColor(),
                    }
                });

                this.addStamp(role.id, i);
            }
            winston.loggers.get(this._id).event(`The botGuild has set up the stamp functionality. Stamps were created by me, I created ${stampAmount} stamps. Stamp collection time is set at ${stampCollectionTime}.`, {event: "Bot Guild"});
        }

        this.stamps.stampCollectionTime = stampCollectionTime;
        this.stamps.isEnabled = true;

        this.setCommandStatus(client);

        return this;
    }

    /**
     * Adds a stamp to the stamp collection. Does not save the mongoose document!
     * @param {String} roleId 
     * @param {Number} stampNumber 
     */
    addStamp(roleId, stampNumber) {
        if (stampNumber === 0) this.stamps.stamp0thRoleId = roleId;
        this.stamps.stampRoleIDs.set(roleId, stampNumber);
        winston.loggers.get(this._id).event(`The botGuild has added a stamp with number ${stampNumber} linked to role id ${roleId}`, {event: "Bot Guild"});
    }

    /**
     * Enables the report commands and sends the reports to the given channel.
     * @param {CommandoClient} client 
     * @param {String} incomingReportChannelID 
     * @returns {Promise<BotGuild>}
     * @async
     */
    async setUpReport(client, incomingReportChannelID) {
        /** @type {CommandoGuild} */
        let guild = await client.guilds.fetch(this._id);

        this.report.isEnabled = true;
        this.report.incomingReportChannelID = incomingReportChannelID;

        guild.setCommandEnabled('report', true);

        winston.loggers.get(this._id).event(`The botGuild has set up the report functionality. It will send reports to the channel id ${incomingReportChannelID}`, {event: "Bot Guild"});
        return this;
    }

    /**
     * Will enable the ask command.
     * @param {CommandoClient} client 
     */
    async setUpAsk(client) {
        /** @type {CommandoGuild} */
        let guild = await client.guilds.fetch(this._id);
        this.ask.isEnabled = true;
        guild.setCommandEnabled('ask', true);
        winston.loggers.get(this._id).event(`The botGuild has enabled the ask command!`, {event: "Bot Guild"});
    }

    /**
     * Will enable and disable the appropriate commands by looking at what is enabled in the botGuild.
     * @param {CommandoClient} client
     * @async 
     */
    async setCommandStatus(client) {
        /** @type {CommandoGuild} */
        let guild = await client.guilds.fetch(this._id);

        guild.setGroupEnabled('verification', this.verification.isEnabled);
        guild.setGroupEnabled('attendance', this.attendance.isEnabled);

        guild.setGroupEnabled('stamps', this.stamps.isEnabled);

        guild.setCommandEnabled('report', this.report.isEnabled);
        guild.setCommandEnabled('ask', this.ask.isEnabled);
        guild.setGroupEnabled('hacker_utility', this.ask.isEnabled || this.report.isEnabled);
        
        client.registry.groups.forEach((group, key, map) => {
            if (group.id.startsWith('a_')) guild.setGroupEnabled(group, this.isSetUpComplete);
        });

        winston.loggers.get(guild.id).verbose(`Set the command status of guild ${guild.name} with id ${guild.id}`);
    }
}
module.exports = BotGuild;