const { Client, MessageEmbed } = require('discord.js-selfbot-v13');
const axios = require('axios');
require('dotenv').config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

const client = new Client();
const checkedUsers = new Set();

let totalScanned = 0;
let totalFound = 0;

const XBOX_GAMERTAG_PATTERNS = [
    /xbox/i,
    /xbl/i,
    /xbox.*live/i,
    /live.*xbox/i,
    /gamertag.*xbox/i,
    /xbox.*gamertag/i,
    /gt.*xbox/i,
    /xbox.*gt/i,
    /\[xbox\]/i,
    /\[xbl\]/i,
    /\(xbox\)/i,
    /\(xbl\)/i,
    /xbox\s*gamer/i,
    /xbox\s*game\s*pass/i
];

client.on('ready', async () => {
    console.clear();
    console.log('='.repeat(60));
    console.log('🎮 XBOX GAMERTAG SCANNER 🎮');
    console.log('='.repeat(60));
    console.log(`✅ Bot conectado como: ${client.user.tag}`);
    console.log(`🏠 Servidores disponíveis: ${client.guilds.cache.size}`);
    console.log('='.repeat(60));
    console.log('\n🚀 INICIANDO SCAN AUTOMÁTICO...');
    console.log('='.repeat(60));
    
    await startXboxScan();
});

async function startXboxScan() {
    console.log('\n🎮 BUSCANDO GAMERTAGS XBOX...');
    console.log('='.repeat(50));
    
    const guilds = client.guilds.cache;
    
    for (const [guildId, guild] of guilds) {
        try {
            console.log(`\n📁 ${guild.name} (${guild.memberCount} membros)`);
            console.log(`   🔍 Buscando membros...`);
            
            const result = await scanGuild(guild);
            
            console.log(`   📊 Escaneados: ${result.scanned} | Gamertags: ${result.found}`);
            
        } catch (error) {
            console.error(`   ❌ Erro em ${guild.name}:`, error.message);
        }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('🎮 SCAN FINALIZADO!');
    console.log(`👥 Total escaneado: ${totalScanned} usuários`);
    console.log(`✅ Gamertags encontradas: ${totalFound}`);
    console.log('='.repeat(50));
}

async function scanGuild(guild) {
    let scanned = 0;
    let found = 0;
    
    try {
        // FORÇAR busca de TODOS os membros do servidor
        console.log(`   ⏳ Carregando todos os ${guild.memberCount} membros...`);
        
        // Método 1: fetch com parâmetros específicos
        await guild.members.fetch({
            force: true,
            cache: true,
            limit: guild.memberCount // Tentar buscar todos
        });
        
        // Método 2: Se o método 1 não pegar todos, buscar em lotes
        if (guild.members.cache.size < guild.memberCount * 0.9) { // Se tiver menos de 90%
            console.log(`   ⚠️  Busca inicial incompleta, tentando método alternativo...`);
            
            // Buscar membros online primeiro
            await guild.members.fetch({ force: true, cache: true });
            
            // Buscar membros offline
            for (let i = 0; i < 5; i++) {
                await guild.members.fetch({
                    force: true,
                    cache: true,
                    limit: 1000,
                    after: [...guild.members.cache.keys()].pop()
                });
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        const memberCount = guild.members.cache.size;
        console.log(`   ✅ ${memberCount} membros carregados no cache`);
        
        let processed = 0;
        
        for (const [memberId, member] of guild.members.cache) {
            if (member.user.bot) continue;
            
            processed++;
            scanned++;
            totalScanned++;
            
            // Mostrar progresso a cada 50 membros
            if (processed % 50 === 0) {
                console.log(`   📈 Progresso: ${processed}/${memberCount} membros`);
            }
            
            // Pular se já foi verificado
            if (checkedUsers.has(memberId)) {
                continue;
            }
            
            // Verificar se tem gamertag Xbox
            const gamertag = await checkForXboxGamertag(member);
            
            if (gamertag) {
                found++;
                totalFound++;
                checkedUsers.add(memberId);
                
                await sendGamertagInfo(member, guild, gamertag);
                
                // Pausa para evitar rate limit
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
        
        return { scanned, found };
        
    } catch (error) {
        console.error(`   ❌ Erro ao escanear ${guild.name}:`, error.message);
        
        // Tentar método alternativo se falhar
        try {
            console.log(`   🔄 Tentando método alternativo...`);
            
            let altScanned = 0;
            let altFound = 0;
            
            // Buscar membros em páginas
            let lastId = null;
            let hasMore = true;
            let pageCount = 0;
            
            while (hasMore && pageCount < 10) {
                const fetchOptions = { force: true, cache: true, limit: 1000 };
                if (lastId) fetchOptions.after = lastId;
                
                const members = await guild.members.fetch(fetchOptions);
                
                for (const [memberId, member] of members) {
                    if (member.user.bot) continue;
                    
                    altScanned++;
                    totalScanned++;
                    
                    if (!checkedUsers.has(memberId)) {
                        const gamertag = await checkForXboxGamertag(member);
                        
                        if (gamertag) {
                            altFound++;
                            totalFound++;
                            checkedUsers.add(memberId);
                            await sendGamertagInfo(member, guild, gamertag);
                            await new Promise(resolve => setTimeout(resolve, 1500));
                        }
                    }
                }
                
                lastId = members.last()?.id;
                hasMore = members.size === 1000;
                pageCount++;
                
                console.log(`   📄 Página ${pageCount}: +${members.size} membros`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            return { scanned: altScanned, found: altFound };
            
        } catch (altError) {
            console.error(`   ❌ Método alternativo também falhou:`, altError.message);
            return { scanned: 0, found: 0 };
        }
    }
}

async function checkForXboxGamertag(member) {
    const user = member.user;
    const username = user.username;
    const displayName = member.displayName;
    
    // Verificar username e apelido
    const namesToCheck = [username];
    if (displayName && displayName !== username) {
        namesToCheck.push(displayName);
    }
    
    for (const name of namesToCheck) {
        // Verificar padrões Xbox
        for (const pattern of XBOX_GAMERTAG_PATTERNS) {
            if (pattern.test(name)) {
                return {
                    gamertag: name,
                    type: 'xbox_keyword',
                    keyword: name.match(pattern)[0],
                    source: name
                };
            }
        }
        
        // Verificar formato GT:
        const gtMatch = name.match(/^(?:gt|gamertag)[:\s]+([A-Za-z0-9_]{3,20})$/i);
        if (gtMatch) {
            return {
                gamertag: gtMatch[1],
                type: 'gt_format',
                source: name
            };
        }
        
        // Verificar formato [Xbox] ou (Xbox)
        const bracketMatch = name.match(/^[\[\(](?:xbox|xbl|gt)[\]\)]\s*([A-Za-z0-9_]{3,20})$/i);
        if (bracketMatch) {
            return {
                gamertag: bracketMatch[1],
                type: 'bracket_format',
                source: name
            };
        }
        
        // Verificar se termina com (Xbox) ou (XBL)
        const suffixMatch = name.match(/^([A-Za-z0-9_]{3,20})\s*[\[\(](?:xbox|xbl)[\]\)]$/i);
        if (suffixMatch) {
            return {
                gamertag: suffixMatch[1],
                type: 'suffix_format',
                source: name
            };
        }
    }
    
    return null;
}

async function sendGamertagInfo(member, guild, gamertagInfo) {
    const user = member.user;
    const username = user.username;
    const userId = user.id;
    const avatarURL = user.displayAvatarURL({ dynamic: true, size: 1024 });
    
    const createdAt = user.createdAt ? user.createdAt.toLocaleDateString('pt-BR') : 'Desconhecido';
    const accountAge = Date.now() - user.createdAt.getTime();
    const accountAgeInYears = Math.floor(accountAge / (1000 * 60 * 60 * 24 * 365));
    
    const status = member.presence?.status || 'offline';
    const statusEmoji = {
        online: '🟢',
        idle: '🟡',
        dnd: '🔴',
        offline: '⚫'
    }[status] || '⚫';
    
    console.log(`      🎮 Gamertag: ${gamertagInfo.gamertag} (${gamertagInfo.type})`);
    
    let bannerURL = null;
    try {
        const fetchedUser = await client.users.fetch(userId, { force: true });
        if (fetchedUser.banner) {
            bannerURL = fetchedUser.bannerURL({ dynamic: true, size: 1024 });
        }
    } catch (error) {}
    
    const embed = new MessageEmbed()
        .setColor('#107C10')
        .setTitle(`🎮 GAMERTAG XBOX DETECTADA 🎮`)
        .addFields([
            { name: '👤 Nome', value: `\`${username}\``, inline: true },
            { name: '🎮 Gamertag', value: `\`${gamertagInfo.gamertag}\``, inline: true },
            { name: '🌐 Servidor', value: `\`${guild.name}\``, inline: true },
            { name: `${statusEmoji} Status`, value: `\`${status}\``, inline: true },
            { name: '📅 Conta Criada', value: `\`${createdAt}\` (${accountAgeInYears} anos)`, inline: true },
            { name: '🆔 ID', value: `\`${userId}\``, inline: true }
        ])
        .setThumbnail(avatarURL)
        .setTimestamp()
        .setFooter(`ID: ${userId} | Scanner Auto`);
    
    if (bannerURL) embed.setImage(bannerURL);
    
    embed.addField('🔍 Tipo', `\`${gamertagInfo.type}\``, true);
    embed.addField('📊 Scan', `Encontrados: ${totalFound} | Total: ${totalScanned}`, true);
    
    const data = {
        content: `🎮 **NOVA GAMERTAG XBOX: \`${gamertagInfo.gamertag}\`** 🎮`,
        embeds: [embed],
    };
    
    try {
        await axios.post(WEBHOOK_URL, data);
        console.log(`         ✅ Webhook enviado`);
    } catch (error) {
        console.error(`         ❌ Erro webhook: ${error.message}`);
    }
}

// Login
client.login(DISCORD_TOKEN);

// Tratar encerramento
process.on('SIGINT', () => {
    console.log('\n\n📊 RESUMO FINAL:');
    console.log('='.repeat(50));
    console.log(`👥 Total escaneado: ${totalScanned} usuários`);
    console.log(`✅ Gamertags encontradas: ${totalFound}`);
    console.log('='.repeat(50));
    console.log('👋 Encerrando scanner...');
    process.exit(0);
});

process.on('unhandledRejection', error => {
    console.error('Erro ignorado:', error.message);
});
