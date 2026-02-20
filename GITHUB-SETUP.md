# GitHub push setup (SSH)

Push was failing due to missing HTTPS credentials. This repo is now set up to use **SSH** instead.

## One-time: add your SSH key to GitHub

1. **Copy this public key** (one line):
   ```
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINXEaDgZwYfdR3kPC7D/1XGGQOGtKSImx8YgHWvKWBDd richn23@github
   ```

2. **Add it on GitHub:**
   - Open: https://github.com/settings/ssh/new
   - **Title:** e.g. `Student Voice (Windows)`
   - **Key:** paste the line above
   - Click **Add SSH key**

3. **Push from your project folder:**
   ```powershell
   cd "c:\Users\richa\Desktop\Web Projects\student-voice"
   git push -u origin main
   ```

After that, `git push` and `git pull` will work without signing in again.

---

*You can delete this file after your first successful push if you like.*
