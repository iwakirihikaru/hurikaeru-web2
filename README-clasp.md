# GAS sync setup

This workspace is prepared for `clasp`.

## Files

- `src/コード.js`
- `src/index.html`
- `src/teacher.html`
- `src/appsscript.json`

## Next steps

1. Install dependencies: `npm install`
2. Login: `npx clasp login`
3. Link existing script: `npx clasp clone <SCRIPT_ID>` or create `.clasp.json`
4. Push local files: `npx clasp push`

## Deploy

- Web app update: `npm run deploy:webapp`
- Distribution update: `npm run deploy:distribution`
- This runs:
  1. `clasp push --force`
  2. `clasp version`
  3. `clasp deploy -i <deploymentId> -V <version>`

`deploy:distribution` also runs:

1. main web app deploy
2. distribution template source push when `admin.config.json.templateScriptId` is set
3. admin distribution page deploy

Deployment target is stored in `deploy.config.json`.

## `.clasp.json` example

```json
{
  "scriptId": "YOUR_SCRIPT_ID",
  "rootDir": "src"
}
```
