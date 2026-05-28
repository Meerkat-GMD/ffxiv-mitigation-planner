# Firebase + GitHub Pages setup

This prototype can run in two modes:

- Local development: Node/WebSocket server from `server.js`.
- Static shared plan: GitHub Pages frontend + Firebase Realtime Database.

## 1. Create Firebase project

1. Create a Firebase project.
2. Add a Web app.
3. Create a Realtime Database.
4. Copy the Web app config into `public/firebase-config.js`.

```js
window.FIREBASE_CONFIG = {
    apiKey: '...',
    authDomain: '...',
    databaseURL: 'https://PROJECT_ID-default-rtdb.REGION.firebasedatabase.app',
    projectId: '...',
    storageBucket: '...',
    messagingSenderId: '...',
    appId: '...',
};
window.FIREBASE_PLAN_ID = 'default';
```

## 2. Realtime Database rules for early prototype use

Use a private/test Firebase project for this prototype. This open rule lets anyone with the page link edit plans.

```json
{
  "rules": {
    "plans": {
      "$planId": {
        ".read": true,
        ".write": true
      }
    },
    "settings": {
      "actionCatalog": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

Before sharing publicly, add authentication or restrict writes.

## 3. GitHub Pages

Publish the contents of `public/` through GitHub Pages. The app uses relative asset paths, so it can run from either:

- `https://USER.github.io/REPO/`
- a custom domain

## 4. Shared plan links

Everyone editing the same URL edits the same Firebase plan.

```text
https://USER.github.io/REPO/?plan=static1
```

Different `plan` values create independent shared plans.
