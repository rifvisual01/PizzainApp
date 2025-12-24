<script>
/**
 * ===============================
 * KONFIGURASI API GAS
 * ===============================
 */
const API_BASE = "https://script.google.com/macros/s/AKfycbwiIUIFZUyBeJrad3inCzt9BrE0Dj4c8tCF1iNmpUC1k9-q4s2WNLQ2kSNOQvpXwDsnnw/exec";

/**
 * ===============================
 * HELPER FETCH (INTI)
 * ===============================
 */
function postToGAS(formData) {
  return fetch(API_BASE, {
    method: "POST",
    body: formData
  })
  .then(res => res.json())
  .catch(err => {
    console.error("Fetch error:", err);
    throw err;
  });
}

/**
 * ===============================
 * API WRAPPER (1:1 GOOGLE.SCRIPT.RUN)
 * ===============================
 */

function apiCreateTransaksi(data) {
  const fd = new FormData();
  fd.append("action", "createTransaksi");

  Object.keys(data).forEach(key => {
    if (data[key] !== undefined && data[key] !== null) {
      fd.append(key, data[key]);
    }
  });

  return postToGAS(fd);
}

function apiUpdateTransaksi(idTransaksi, data) {
  const fd = new FormData();
  fd.append("action", "updateTransaksi");
  fd.append("idTransaksi", idTransaksi);

  Object.keys(data).forEach(key => {
    if (data[key] !== undefined && data[key] !== null) {
      fd.append(key, data[key]);
    }
  });

  return postToGAS(fd);
}

function apiGetAllTransaksi() {
  const fd = new FormData();
  fd.append("action", "getAllTransaksi");
  return postToGAS(fd);
}

function apiDeleteTransaksi(idTransaksi) {
  const fd = new FormData();
  fd.append("action", "deleteTransaksi");
  fd.append("idTransaksi", idTransaksi);
  return postToGAS(fd);
}

function apiCheckPin(pin) {
  const fd = new FormData();
  fd.append("action", "checkPin");
  fd.append("pin", pin);
  return postToGAS(fd);
}
</script>
