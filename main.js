require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, PermissionsBitField, ChannelType} = require('discord.js');

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;

// コマンドの定義
const commands = [
    new SlashCommandBuilder()
        .setName('rename')
        .setDescription('Rename the channel.')
        .addStringOption(option => option.setName('new_name').setDescription('New name for the channel.').setRequired(true)),
    new SlashCommandBuilder()
        .setName('set-limit')
        .setDescription('Set the user limit for the channel.')
        .addIntegerOption(option => option.setName('limit').setDescription('User limit for the channel.').setRequired(true)),
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick the user from the channel.')
        .addUserOption(option => option.setName('user').setDescription('User to kick from the channel.').setRequired(true)),
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
        ].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

// コマンドの登録
(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

// 作成者を記録するためのマップ
const channelCreators = new Map();

// ログイン時の処理
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// サーバーに参加した際の処理
client.on('guildCreate', async (guild) => {
    console.log(`Guild available: ${guild.name}`);
    // "join to create" チャンネルがない場合、作成
    let joinToCreateChannel = guild.channels.cache.find(channel => channel.name === 'join to create');

    if (!joinToCreateChannel) {
        await guild.channels.create({
            name: 'join to create',
            type: ChannelType.GuildVoice,
            permissionOverwrites: [
                {
                    id: guild.id,
                    allow: [PermissionsBitField.Flags.Connect],
                },
            ],
        });
        console.log('Created "join to create" channel.');
    } else {
        console.log('"join to create" channel already exists.');
    }
})

// ボイスチャンネルに変更があった際の処理
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (!oldState.channel && newState.channel) {
        const guild = newState.guild;
        const member = newState.member;

        // ユーザー名と同じ名前のチャンネルを探す
        let userChannel = guild.channels.cache.find(channel => channel.name === member.user.username);

        // チャンネルが存在しない場合、新しく作成
        if (!userChannel) {
            userChannel = await guild.channels.create({
                name: member.user.username,
                type: ChannelType.GuildVoice,
            });

            // チャンネルの作成者を記録
            channelCreators.set(userChannel.id, member.id);
        } else {
            // チャンネルの作成者が違う場合、新しく作成
            if (channelCreators.has(userChannel.id) && channelCreators.get(userChannel.id) !== member.id) {
                userChannel = await guild.channels.create({
                    name: member.user.username,
                    type: ChannelType.GuildVoice,
                });

                // チャンネルの作成者を記録
                channelCreators.set(userChannel.id, member.id);
            }
        }

        // ユーザーを新しいチャンネルに移動
        await member.voice.setChannel(userChannel);
    }
    // ボイスチャンネルから全てのユーザーがいなくなった場合
    if (oldState.channel && !oldState.channel.members.size) {
        // チャンネルが記録されている場合
        if (channelCreators.has(oldState.channel.id)) {
            channelCreators.delete(oldState.channel.id);
            await oldState.channel.delete();
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    // チャンネルの名前変更
    if (commandName === 'rename') {
        const newName = options.getString('new_name');
        const channelId = getChannelIdByMemberId(interaction.user.id);

        // renameコマンドを実行したユーザーが作成したチャンネルがない場合
        if (!channelId) {
            return interaction.reply('You do not have a channel to rename.');
        }

        const channel = interaction.guild.channels.cache.get(channelId);
        // チャンネルidが見つからない場合
        if (!channel) {
            return interaction.reply('Channel not found.');
        }

        try {
            // チャンネル名変更
            await channel.setName(newName);
            await interaction.reply(`Renamed the channel to ${newName}.`);
        } catch (error) {
            console.error(error);
            await interaction.reply('Failed to rename the channel.');
        }
    }

    // ユーザー制限の設定
    if (commandName === 'set-limit') {
        const limit = options.getInteger('limit');
        const channelId = getChannelIdByMemberId(interaction.user.id);

        // set-limitコマンドを実行したユーザーが作成したチャンネルがない場合
        if (!channelId) {
            return interaction.reply('You do not have a channel to set limit.');
        }

        const channel = interaction.guild.channels.cache.get(channelId);
        // チャンネルidが見つからない場合
        if (!channel) {
            return interaction.reply('Channel not found.');
        }

        try {
            // ユーザー制限の設定
            await channel.setUserLimit(limit);
            await interaction.reply(`Set the user limit to ${limit}.`);
        } catch (error) {
            console.error(error);
            await interaction.reply('Failed to set the user limit.');
        }
    }

    // ユーザーのキック
    if (commandName === 'kick') {
        const user = options.getUser('user');
        const channelId = getChannelIdByMemberId(interaction.user.id);

        // kickコマンドを実行したユーザーが作成したチャンネルがない場合
        if (!channelId) {
            return interaction.reply('You do not have a channel to kick user from.');
        }

        const channel = interaction.guild.channels.cache.get(channelId);
        // チャンネルidが見つからない場合
        if (!channel) {
            return interaction.reply('Channel not found.');
        }

        try {
            // ユーザーのキック
            const member = channel.members.get(user.id);
            if (!member) {
                return interaction.reply('User not found in the channel.');
            }
            await member.voice.disconnect()
            await interaction.reply(`Kicked ${user.username} from the channel.`);
        } catch (error) {
            console.error(error);
            await interaction.reply('Failed to kick the user.');
        }
    }

    // ピンポン
    if (commandName === 'ping') {
        await interaction.reply('Pong!');
    }
});

// チャンネル作成者のIDからチャンネルIDを取得
function getChannelIdByMemberId(memberId) {
    for (const [channelId, id] of channelCreators.entries()) {
        if (id === memberId) {
            return channelId;
        }
    }
    return null;
}

client.login(token);