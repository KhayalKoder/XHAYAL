const { createClient } = require('@supabase/supabase-js');

// Railway-dəki Variables-dən avtomatik oxuyur
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function getOrCreatePlayer(name, avatar) {
    const { data: player } = await supabase
        .from('players')
        .select('*')
        .eq('name', name)
        .single();

    if (player) {
        await supabase.from('players').update({ avatar }).eq('name', name);
        return player;
    }

    const { data: newPlayer } = await supabase
        .from('players')
        .insert([{ name, avatar, chips: 1000 }])
        .select()
        .single();
    
    return newPlayer;
}

async function updatePlayerChips(name, chips) {
    await supabase.from('players').update({ chips }).eq('name', name);
}

async function recordHandResult(name, won, amount, handName, roomId) {
    // Əvvəlcə oyunçu məlumatını çəkib yeniləməliyik
    const { data: p } = await supabase.from('players').select('*').eq('name', name).single();
    if (p) {
        await supabase.from('players').update({
            hands_played: p.hands_played + 1,
            hands_won: p.hands_won + (won ? 1 : 0),
            total_winnings: p.total_winnings + amount
        }).eq('name', name);
    }
}

async function getLeaderboard(type = 'chips', limit = 20) {
    const { data } = await supabase.from('players').select('*').order(type, { ascending: false }).limit(limit);
    return data || [];
}

async function getPlayerStats(name) {
    const { data } = await supabase.from('players').select('*').eq('name', name).single();
    return data;
}

module.exports = { getOrCreatePlayer, updatePlayerChips, recordHandResult, getLeaderboard, getPlayerStats };

