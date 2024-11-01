const { Command } = require('@sapphire/framework');
const firebaseUtil = require('../../db/firebase/firebaseUtil');
const { Message, MessageEmbed, Modal, MessageActionRow, MessageButton, TextInputComponent } = require('discord.js');
const { discordLog } = require('../../discord-services');

class StartVerification extends Command {
    constructor(context, options) {
        super(context, {
            ...options,
            description: 'Start verification prompt in landing channel.'
        });
    }

    registerApplicationCommands(registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
        ),
        {
            idHints: '1060545714133938309'
        };
    }

    async chatInputRun(interaction) {
        this.initBotInfo = await firebaseUtil.getInitBotInfo(interaction.guild.id);
        const guild = interaction.guild;
        const userId = interaction.user.id;
        if (!guild.members.cache.get(userId).roles.cache.has(this.initBotInfo.roleIDs.staffRole) && !guild.members.cache.get(userId).roles.cache.has(this.initBotInfo.roleIDs.adminRole)) {
            interaction.reply({ content: 'You do not have permissions to run this command!', ephemeral: true });
            return;
        }
        if (!this.initBotInfo.verification.isEnabled) {
            await interaction.reply({ content: 'Verification has not been enabled!', ephemeral: true});
            return;
        }

        const embed = new MessageEmbed()
            .setTitle(`Please click the button below to check-in to the ${interaction.guild.name} server! Make sure you know which email you used to apply to ${interaction.guild.name}!`);
        // modal timeout warning?
        const row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId('verify')
                    .setLabel('Check-in')
                    .setStyle('PRIMARY'),
            );
        interaction.reply({ content: 'Verification started!', ephemeral: true });
        const msg = await interaction.channel.send({ content: 'If you have not already, make sure to enable DMs, emojis, and embeds/link previews in your personal Discord settings! If you have any issues, please find an organizer!', embeds: [embed], components: [row] });

        const checkInCollector = msg.createMessageComponentCollector({ filter: i => !i.user.bot});

        // console.log(this.botGuild.verification.guestRoleID)
        // console.log(this.botGuild.verification)


        checkInCollector.on('collect', async i => {
            if (!interaction.guild.members.cache.get(i.user.id).roles.cache.has(this.initBotInfo.verification.guestRoleID)) {
                await i.reply({ content: 'You are not eligible to be checked in! If you don\'t have correct access to the server, please contact an organizer.', ephemeral: true});
                return;
            }
            const modal = new Modal()
                .setCustomId('verifyModal')
                .setTitle('Check-in to gain access to the server!')
                .addComponents([
                    new MessageActionRow().addComponents(
                        new TextInputComponent()
                            .setCustomId('email')
                            .setLabel('Enter the email that you applied with!')
                            .setMinLength(3)
                            .setMaxLength(320)
                            .setStyle('SHORT')
                            .setPlaceholder('Email Address')
                            .setRequired(true),
                    ),
                ]);
            await i.showModal(modal);

            const submitted = await i.awaitModalSubmit({ time: 300000, filter: j => j.user.id === i.user.id })
                .catch(error => {
                });

            if (submitted) {
                const email = submitted.fields.getTextInputValue('email');
                let types;
                try {
                    types = await firebaseUtil.verify(email, submitted.user.id, submitted.guild.id);
                } catch {
                    submitted.reply({ content: 'Your email could not be found! Please try again or ask an admin for help.', ephemeral: true });
                    discordLog(interaction.guild, `VERIFY FAILURE : <@${submitted.user.id}> Verified email: ${email} but was a failure, I could not find that email!`);
                    return;
                }
                
                if (types.length === 0) {
                    submitted.reply({ content: 'You have already verified!', ephemeral: true });
                    discordLog(interaction.guild, `VERIFY WARNING : <@${submitted.user.id}> Verified email: ${email} but they are already verified for all types!`);
                    return;
                }

                let correctTypes = [];
                types.forEach(type => {
                    console.log(type, ' is the TYPE');
                    const roleObj = this.initBotInfo.verification.roles.find(role => role.name === type);
                    if (roleObj || type === 'staff' || type === 'mentor') {
                        const member = interaction.guild.members.cache.get(submitted.user.id);
                        let roleId;
                        if (type === 'staff') {
                            roleId = this.initBotInfo.roleIDs.staffRole;
                        } else if (type === 'mentor') {
                            roleId = this.initBotInfo.roleIDs.mentorRole;
                        } else {
                            roleId = roleObj.roleId;
                        }
                        if (member && roleId) {
                            member.roles.add(roleId);
                
                            if (correctTypes.length === 0) {
                                member.roles.remove(this.initBotInfo.verification.guestRoleID);
                                member.roles.add(this.initBotInfo.roleIDs.memberRole);
                            }
                            correctTypes.push(type);
                        } else {
                            console.warn(`Could not add role: ${roleId} for type: ${type}`);
                        }
                    } else {
                        discordLog(interaction.guild, `VERIFY WARNING: <@${submitted.user.id}> was of type ${type} but I could not find that type!`);
                    }
                });

                if (correctTypes.length > 0) {
                    submitted.reply({ content: 'You have successfully verified as a ' + correctTypes.join(', ') + '!', ephemeral: true });
                }
            }
        });

        const savedMessagesCol = firebaseUtil.getSavedMessagesSubCol(interaction.guild.id);
        await savedMessagesCol.doc('startverification').set({
            messageId: msg.id,
            channelId: msg.channel.id,
        });
        const mentorCaveDoc = await savedMessagesCol.doc('startverification').get();
        if (!mentorCaveDoc.exists) return 'Saved messages doc for start verification cave does not exist';
    }

    /**
     * 
     * @param {Guild} guild 
     */
    async tryRestoreReactionListeners(guild) {
        const savedMessagesCol = firebaseUtil.getSavedMessagesSubCol(guild.id);
        const reportDoc = await savedMessagesCol.doc('startverification').get();
        if (reportDoc.exists) {
            const { messageId, channelId } = reportDoc.data();
            const channel = await this.container.client.channels.fetch(channelId);
            if (channel) {
                try {
                    /** @type {Message} */
                    const message = await channel.messages.fetch(messageId);
                    this.listenToReports(guild, message);
                } catch (e) {
                    // message doesn't exist anymore
                    return e;
                }
            } else {
                return 'Saved message channel does not exist';
            }
        } else {
            return 'No existing saved message for start verification command';
        }
    }
}
module.exports = StartVerification;