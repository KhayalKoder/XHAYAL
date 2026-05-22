const { createClient } = require('@supabase/supabase-js');

// Render/Railway-də "Environment Variables" (Dəyişənlər) bölməsində 
// SUPABASE_URL və SUPABASE_KEY dəyərlərini əlavə etməlisiniz.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function getOrCreatePlayer(name, avatar) {
  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('name', name)
    .single();

  if (player) {
    return player;
  }

  const { data: newPlayer } = await supabase
    .from('players')
    .insert([{ name, avatar, chips: 1000 }])
    .select()
    .single();
  
  return newPlayer;
}

// Digər funksiyaları (updatePlayerChips, recordHandResult və s.) 
// Supabase-in .update() və .insert() metodları ilə yenidən yazın.

module.exports = {
  getOrCreatePlayer,
  // ...digər funksiyalar
};
