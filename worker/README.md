# Opinion submissions: one-time setup

The public **Write for us** page cannot save files in your repository by itself (visitors have no GitHub access, and
your token must never be put on a public page). A small free **Cloudflare Worker** sits in the middle: it checks each
article and saves it in a **private** GitHub repository, where your admin page lists it as "Pending review".

Why a private repository? Your main repository is public, so anything saved in it, including authors' emails and phone
numbers and unreviewed articles, would be readable by everyone.

## 1. Create the private repository
1. GitHub, New repository. Name: `vanywinner-submissions`. Choose **Private**. Tick "Add a README file".

## 2. Create two access tokens (GitHub, Settings, Developer settings, Fine-grained tokens)
- **Worker token** (name it `vanywinner-submit-worker`): repository access **only** `vanywinner-submissions`,
  permission **Contents: Read and write**.
- **Admin token**: your existing admin token must now include **both** repositories (`vanywinner` and
  `vanywinner-submissions`), each with **Contents: Read and write**. Edit the token, or create a new one and paste it
  on `admin.html` again.

## 3. Create the Worker (Cloudflare dashboard)
1. Workers and Pages, Create, **Create Worker**. Name it `vanywinner-submit`, press **Deploy**.
2. Press **Edit code**, delete the sample, paste everything from `worker/submit-worker.js`, press **Deploy**.
3. Worker, **Settings, Variables and Secrets**, add:
   - `GITHUB_TOKEN` (type **Secret**): the Worker token from step 2
   - `GITHUB_REPO` (type Text): `vanywinner/vanywinner-submissions`
   - optional `IP_SALT` (Secret): any random text
4. Copy the Worker address shown at the top, for example `https://vanywinner-submit.yourname.workers.dev`.

## 4. Tell the website about it
1. Open `admin.html`, go to **Site settings**, paste the Worker address in **Submission address**, press **Save settings**.
2. Wait a minute or two for the site to rebuild. The Write for us page then accepts articles.

## 5. Strongly recommended: bot protection (free)
1. Cloudflare, **Turnstile**, Add widget, domain `vanywinner.co.ke`. Copy the **Site key** and **Secret key**.
2. Worker, Settings, add `TURNSTILE_SECRET` (Secret) with the secret key, then Deploy again.
3. Admin, Site settings, paste the **Turnstile site key**, Save settings.
4. Also add a rate limit: Cloudflare, Security, WAF, Rate limiting rules, for requests to your Worker address, for
   example 5 requests per 10 minutes per IP.

## 6. Test it
1. Open `https://vanywinner.co.ke/write-for-us.html`, write at least 150 words and send.
2. A new file appears in the private repository under `submissions/`.
3. In `admin.html` the **Opinion submissions** box shows it as **Pending review**. Press **Review**, edit if you like,
   then **Publish opinion** (or **Reject**).

## What the Worker checks
Headline 8 to 140 characters, a name, valid optional email and phone, 150 to 2,500 words, no scripts, a tick for the
consent box, a hidden trap field for bots, a minimum time on the page, and Turnstile when it is switched on.

## Troubleshooting
- "This request is not allowed from this website": the page is opened from another address. The Worker only accepts
  `vanywinner.co.ke` and `www.vanywinner.co.ke`. Add others in the optional `ALLOWED_ORIGINS` variable.
- "We could not save your article": the Worker token cannot write to the private repository, or `GITHUB_REPO` is wrong.
- The admin box says it could not load submissions: your admin token does not include the private repository.
