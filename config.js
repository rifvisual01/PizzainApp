// Konfigurasi aplikasi.
// App tetap bisa jalan offline-only walau Supabase key belum diisi.
// Untuk sinkronisasi Supabase, ganti supabaseAnonKey dengan anon key project yang sesuai URL di bawah.
window.STOCK_APP_CONFIG = {
  supabaseUrl: "https://qipqhopjbwjquschrggt.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpcHFob3BqYndqcXVzY2hyZ2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjQ1MDYsImV4cCI6MjA5NzQ0MDUwNn0._LAfxDUc7JDb8SfGjL-XwoeC2ECbrJvDoEKx4_iTuH0",
  supabaseTables: {
    users: "users",
    items: "items",
    stockLogs: "stock_logs",
    shoppingExpenses: "shopping_expenses",
    shoppingExpenseItems: "shopping_expense_items",
    shoppingOperationalCosts: "shopping_operational_costs"
  }
};

