const { Command } = require('@sapphire/framework');
const { discordLog, checkForRole } = require('../../discord-services');
const { Message, MessageEmbed, Snowflake, MessageActionRow, MessageButton } = require('discord.js');
const { getQuestion, lookupById, saveToLeaderboard, retrieveLeaderboard } = require('../../db/firebase/firebaseUtil');
const firebaseUtil = require('../../db/firebase/firebaseUtil');

/**
 * The DiscordContests class handles all functions related to Discord contests. It will ask questions in set intervals and pick winners
 * based on keywords for those questions that have correct answers. For other questions it will tag staff and staff will be able to tell
 * it the winner. It can also be paused and un-paused, and questions can be removed.
 * 
 * Note: all answers are case-insensitive but any extra or missing characters will be considered incorrect.
 * @category Commands
 * @subcategory Activity
 * @extends Command
 * @guildonly
 */
class DiscordContests extends Command {
    constructor(context, options) {
        super(context, {
            ...options,
            description: 'Start discord contests.'
        });
    }

    registerApplicationCommands(registry) {
        registry.registerChatInputCommand((builder) =>
            builder
                .setName(this.name)
                .setDescription(this.description)
                .addIntegerOption(option =>
                    option.setName('interval')
                        .setDescription('Time (minutes) between questions')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('notify')
                        .setDescription('Role to notify when a question drops')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('start_question_now')
                        .setDescription('True to start first question now, false to start it after one interval')
                        .setRequired(false))
        ),
        {
            idHints: '1051737343729610812'
        };
    }

    /**
     * Stores a map which keeps the questions (strings) as keys and an array of possible answers (strings) as values. It iterates through
     * each key in order and asks them in the Discord channel in which it was called at the given intervals. It also listens for emojis
     * that tell it to pause, resume, or remove a specified question. 
     * @param {Command.ChatInputInteraction} interaction
     */
    async chatInputRun(interaction) {
        // helpful prompt vars
        let channel = interaction.channel;
        let userId = interaction.user.id;
        let guild = interaction.guild;
        const initBotInfo = await firebaseUtil.getInitBotInfo(guild.id);
        // let botSpamChannel = guild.channels.resolve(this.botGuild.channelIDs.botSpamChannel);
        let adminLog = await guild.channels.fetch(initBotInfo.channelIDs.adminLog);
        let adminConsole = await guild.channels.fetch(initBotInfo.channelIDs.adminConsole);

        let interval;

        //ask user for time interval between questions
        let timeInterval = interaction.options.getInteger('interval') * 60000;
        let startNow = interaction.options.getBoolean('start_question_now');
        let roleId = interaction.options.getRole('notify');

        if (!guild.members.cache.get(userId).roles.cache.has(initBotInfo.roleIDs.staffRole) && !guild.members.cache.get(userId).roles.cache.has(initBotInfo.roleIDs.adminRole)) {
            interaction.reply({ content: 'You do not have permissions to run this command!', ephemeral: true });
            return;
        }

        if (Object.values(initBotInfo.roleIDs).includes(roleId.id) || initBotInfo.verification.roles.some((r) => r.roleId === roleId.id)) {
            interaction.reply({ content: 'This role cannot be used! Please pick a role that is specifically for Discord Contest notifications!', ephemeral: true });
            return;
        }
        // try {
        //     let num = await NumberPrompt.single({prompt: 'What is the time interval between questions in minutes (integer only)? ', channel, userId, cancelable: true});
        //     timeInterval = 1000 * 60 * num;

        //     // ask user whether to start asking questions now(true) or after 1 interval (false)
        //     var startNow = await SpecialPrompt.boolean({prompt: 'Type "yes" to start first question now, "no" to start one time interval from now. ', channel, userId, cancelable: true});

        //     // id of role to mention when new questions come out
        //     var roleId = (await RolePrompt.single({prompt: 'What role should I notify with a new Discord contest is available?', channel, userId})).id;
        // } catch (error) {
        //     channel.send('<@' + userId + '> Command was canceled due to prompt being canceled.').then(msg => msg.delete({timeout: 5000}));
        //     return;
        // }

        //paused keeps track of whether it has been paused
        var paused = false;

        /**
         * array of winners' ids
         * @type {Array<Snowflake>}
         */
        const winners = [];

        var string = 'Discord contests starting soon! Answer questions for a chance to win prizes!';

        const row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId('play')
                    .setLabel('Play')
                    .setStyle('PRIMARY'),
            )
            .addComponents(
                new MessageButton()
                    .setCustomId('pause')
                    .setLabel('Pause')
                    .setStyle('PRIMARY'),
            )
            .addComponents(
                new MessageButton()
                    .setCustomId('refresh')
                    .setLabel('Refresh leaderboard')
                    .setStyle('PRIMARY'),
            );


        // const playFilter = i => i.customId == 'play' && !i.user.bot && (guild.members.cache.get(userId).roles.cache.has(this.botGuild.roleIDs.staffRole) || guild.members.cache.get(userId).roles.cache.has(this.botGuild.roleIDs.adminRole));
        // const playCollector = adminConsole.createMessageComponentCollector(playFilter);
        // playCollector.on('collect', async i => {
        //     console.log('play collector')
        //     if (paused) {
        //         sendQuestion(this.botGuild);
        //         interval = setInterval(sendQuestion, timeInterval, this.botGuild);
        //         paused = false;
        //         await guild.channels.resolve(this.botGuild.channelIDs.adminLog).send('Discord contest restarted by <@' + i.user.id + '>!');
        //         await i.reply('<@&' + i.user.id + '> Discord contest has been un-paused!');
        //     }
        // });

        const startEmbed = new MessageEmbed()
            .setColor(initBotInfo.embedColor)
            .setTitle(string)
            .setDescription('Note: Short-answer questions are non-case sensitive but any extra or missing symbols will be considered incorrect.')
            .addFields([{name: 'Click the 🍀 emoji below to be notified when a new question drops!', value: 'You can un-react to stop.'}]);

        const leaderboard = new MessageEmbed()
            .setTitle('Leaderboard');
            
        let pinnedMessage = await channel.send({ content: '<@&' + roleId + '>', embeds: [startEmbed, leaderboard] });
        pinnedMessage.pin();
        pinnedMessage.react('🍀');

        const roleSelectionCollector = pinnedMessage.createReactionCollector({ filter: (reaction, user) => !user.bot, dispose: true});
        roleSelectionCollector.on('collect', (reaction, user) => {
            if (reaction.emoji.name === '🍀') {
                guild.members.cache.get(user.id).roles.add(roleId);
            }
        });
        roleSelectionCollector.on('remove', (reaction, user) => {
            if (reaction.emoji.name === '🍀') {
                guild.members.cache.get(user.id).roles.remove(roleId);
            }
        });

        interaction.reply({ content: 'Discord contest has been started!', ephemeral: true });
        const controlPanel = await adminConsole.send({ content: 'Discord contests control panel. Status: Active', components: [row] });
        adminLog.send('Discord contests started by <@' + userId + '>');
        const filter = i => !i.user.bot && (guild.members.cache.get(i.user.id).roles.cache.has(initBotInfo.roleIDs.staffRole) || guild.members.cache.get(i.user.id).roles.cache.has(initBotInfo.roleIDs.adminRole));
        const collector = controlPanel.createMessageComponentCollector({filter});
        collector.on('collect', async i => {
            if (i.customId == 'refresh') {
                await i.reply({ content: 'Leaderboard refreshed!', ephemeral: true });
                await updateLeaderboard(null);
            } else if (interval != null && !paused && i.customId == 'pause') {
                clearInterval(interval);
                paused = true;
                await i.reply({ content: 'Discord contests has been paused!', ephemeral: true });
                await controlPanel.edit({ content: 'Discord contests control panel. Status: Paused'});
            } else if (paused && i.customId == 'play') {
                await sendQuestion(initBotInfo);
                interval = setInterval(sendQuestion, timeInterval, initBotInfo);
                paused = false;
                await i.reply({ content: 'Discord contests has been un-paused!', ephemeral: true });
                await controlPanel.edit({ content: 'Discord contests control panel. Status: Active'});
            } else {
                await i.reply({ content: 'Wrong button or wrong permissions!', ephemeral: true });
            }
        });

        //starts the interval, and sends the first question immediately if startNow is true
        if (startNow) {
            await sendQuestion(initBotInfo);
        }
        interval = setInterval(sendQuestion, timeInterval, initBotInfo);

        async function updateLeaderboard(memberId) {
            if (memberId) {
                await saveToLeaderboard(guild.id, memberId);
            }
            const winnersList = await retrieveLeaderboard(guild.id);
            var leaderboardString = '';
            winnersList.forEach(winner => {
                leaderboardString += '<@' + winner.memberId + '>: ';
                if (winner.points > 1) {
                    leaderboardString += winner.points + ' points\n';
                } else if (winner.points == 1) {
                    leaderboardString += '1 point\n';
                }
            });
            const newLeaderboard = new MessageEmbed(leaderboard).setDescription(leaderboardString);
            pinnedMessage.edit({ embeds: [startEmbed, newLeaderboard] });
        }

        /**
         * @param {FirebaseFirestore.DocumentData | null | undefined} initBotInfo
         * sendQuestion is the function that picks and sends the next question, then picks the winner by matching participants' messages
         * against the answer(s) or receives the winner from Staff. Once it reaches the end it will notify Staff in the Logs channel and
         * list all the winners in order.
         */
        async function sendQuestion(initBotInfo) {
            //get question's parameters from db 
            let data = await getQuestion(guild.id);

            //sends results to Staff after all questions have been asked and stops looping
            if (data === null) {
                discordLog(guild, '<@&' + initBotInfo.roleIDs.staffRole + '> Discord contests have ended!');
                clearInterval(interval);
                return;
            }
            
            /** @type {string} */
            let question = data.question;
            /** @type {string[]} */
            let answers = data.answers;
            let needAllAnswers = data.needAllAnswers;

            const qEmbed = new MessageEmbed()
                .setTitle('A new Discord Contest Question:')
                .setDescription(question);


            const row = new MessageActionRow()
                .addComponents(
                    new MessageButton()
                        .setCustomId('winner')
                        .setLabel('Select winner')
                        .setStyle('PRIMARY'),
                );


            await channel.send({ content: '<@&' + roleId + '>', embeds: [qEmbed] });
            if (answers.length === 0) {
                //send message to console
                const questionMsg = await adminConsole.send({ content: '<@&' + initBotInfo.roleIDs.staffRole + '>' + 'need manual review!', embeds: [qEmbed], components: [row] });

                const filter = i => !i.user.bot && i.customId === 'winner' && (guild.members.cache.get(i.user.id).roles.cache.has(initBotInfo.roleIDs.staffRole) || guild.members.cache.get(i.user.id).roles.cache.has(initBotInfo.roleIDs.adminRole));
                const collector = await questionMsg.createMessageComponentCollector({ filter });

                collector.on('collect', async i => {
                    const winnerRequest = await i.reply({ content: '<@' + i.user.id + '> Mention the winner in your next message!', fetchReply: true });

                    const winnerFilter = message => message.author.id === i.user.id; // error?
                    const winnerCollector = await adminConsole.createMessageCollector({ filter: winnerFilter, max: 1 });
                    winnerCollector.on('collect', async m => {
                        if (m.mentions.members.size > 0) {
                            const member = await m.mentions.members.first();
                            const memberId = await member.user.id;
                            await m.delete();
                            await questionMsg.delete();
                            await i.editReply('<@' + memberId + '> has been recorded!');
                            row.components[0].setDisabled(true);
                            // row.components[0].setDisabled(); 
                            await channel.send('Congrats <@' + memberId + '> for the best answer to the last question!');
                            // winners.push(memberId);
                            await updateLeaderboard(memberId);
                            collector.stop();
                            // await recordWinner(memberId);
                        } else {
                            await m.delete();
                            // await winnerRequest.deleteReply();
                            let errorMsg = await i.editReply({ content: 'Message does not include a user mention!' });
                            setTimeout(function () {
                                errorMsg.delete();
                            }, 5000);
                        }
                    });
                });
            } else {
                //automatically mark answers
                const filter = m => !m.author.bot && (initBotInfo.verification.isEnabled ? checkForRole(m.member, initBotInfo.verification.roles.find((r) => r.name === 'hacker')?.roleId) : checkForRole(m.member, initBotInfo.roleIDs.memberRole));
                const collector = channel.createMessageCollector({ filter, time: timeInterval * 0.75 });

                collector.on('collect', async m => {
                    if (!needAllAnswers) {
                        // for questions that have numbers as answers, the answer has to match at least one of the correct answers exactly
                        if (!isNaN(answers[0])) {
                            if (answers.some(correctAnswer => m.content === correctAnswer)) {
                                await channel.send('Congrats <@' + m.author.id + '> for getting the correct answer! The answer key is ' + answers.join(' or ') + '.');
                                // winners.push(m.author.id);
                                await updateLeaderboard(m.author.id);
                                collector.stop();
                                recordWinner(m.member);
                            }
                        } else if (answers.some(correctAnswer => m.content.toLowerCase().includes(correctAnswer.toLowerCase()))) {
                            //for most questions, an answer that contains at least once item of the answer array is correct
                            await channel.send('Congrats <@' + m.author.id + '> for getting the correct answer! The answer key is ' + answers.join(' or ') + '.');
                            // winners.push(m.author.id);
                            await updateLeaderboard(m.author.id);
                            collector.stop();
                            recordWinner(m.member);
                        }
                    } else {
                        //check if all answers in answer array are in the message
                        if (answers.every((answer) => m.content.toLowerCase().includes(answer.toLowerCase()))) {
                            await channel.send('Congrats <@' + m.author.id + '> for getting the correct answer! The answer key is ' + answers.join(', ') + '.');
                            // winners.push(m.author.id);
                            await updateLeaderboard(m.author.id);
                            collector.stop();
                            recordWinner(m.member);
                        }
                    }
                });

                collector.on('end', async () => {
                    await channel.send('Answers are no longer being accepted. Stay tuned for the next question!');
                });
            }
        }

        async function recordWinner(member) {
            try {
                let email = await lookupById(guild.id, member.id);
                discordLog(guild, `Discord contest winner: <@${member.id}> - ${email}`);
            } catch (error) {
                console.log(error);
            }
        }
    }
}
module.exports = DiscordContests;
