const fs = require('fs');
let code = fs.readFileSync('src/components/SavesModal.tsx', 'utf8');

const targetCatch = `    } catch (err: any) {
      alert("Failed to generate font: " + err.message);
      if (progressEl) progressEl.innerText = "";
    } finally {`;

const replaceCatch = `    } catch (err: any) {
      fetch('/api/log-error', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ message: "Modal Generator Crash: " + (err.message || String(err)), stack: err.stack }) }).catch(()=>console.log(err));
      alert("Failed to generate font: " + err.message);
      if (progressEl) progressEl.innerText = "Error: " + err.message;
    } finally {`;

if (code.includes(targetCatch)) {
    code = code.replace(targetCatch, replaceCatch);
    fs.writeFileSync('src/components/SavesModal.tsx', code);
    console.log("Patched to log generator errors");
} else {
    console.log("Could not find target catch block");
}
