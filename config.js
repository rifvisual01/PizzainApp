// Konfigurasi aplikasi.
// App tetap bisa jalan offline-only walau Supabase key belum diisi.
// Untuk sinkronisasi Supabase, ganti supabaseAnonKey dengan anon key project yang sesuai URL di bawah.
window.STOCK_APP_CONFIG = {
  supabaseUrl: "https://veifszvxdfkzpcxhbqlu.supabase.co",
  supabaseAnonKey: "sb_publishable_sFeKaDZ84lUC5YAaMlUzKA_bYdfxf4o",
  supabaseTables: {
    users: "users",
    items: "items",
    stockLogs: "stock_logs"
  }
};
