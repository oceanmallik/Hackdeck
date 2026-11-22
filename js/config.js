// js/config.js
// Supabase Project Configuration for Hackdeck
const SUPABASE_URL = "https://poenybxcclyuhdqleppx.supabase.co";
const SUPABASE_KEY = "sb_publishable_mjVqAi5EJgcuH4jcM-nUtA_XgY49aSL";

// Initialize Supabase Client using CDN library
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Export / attach to window object for global script access
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_KEY = SUPABASE_KEY;
window.supabaseClient = supabaseClient;
