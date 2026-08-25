const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');
content = content.replace(/console\.log\("Saved FusedFont\.ttf to workspace folder:", outputPath\);[\s\S]*?} catch \(fsErr\) {[\s\S]*?console\.error\("Failed to save to disk:", fsErr\);[\s\S]*?}[\s\S]*?\} catch \(err: any\) {/g, 
`console.log("Saved FusedFont.ttf to workspace folder:", outputPath);
      res.json({ success: true, path: outputPath });
    } catch (fsErr: any) {
      console.error("Failed to save to disk:", fsErr);
      res.status(500).json({ error: "Failed to save: " + fsErr.message });
    }
  } catch (err: any) {`);
fs.writeFileSync('server.ts', content);
