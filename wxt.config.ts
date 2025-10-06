import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    manifest_version: 3,
    name: "NotebookLM to Google Docs",
    version: "0.0.1",
    action: {
      default_title: "Export block to Google Docs"
    },
    icons: {
      '16': 'icon/icon-16.png',
      '32': 'icon/icon-32.png',
      '48': 'icon/icon-48.png',
      '96': 'icon/icon-96.png',
      '128': 'icon/icon-128.png'
    },
    permissions: [
      "identity",
      "scripting",
      "activeTab"
    ],
    host_permissions: [
      "https://notebooklm.google.com/*"
    ],
    oauth2: {
      client_id: "393202409195-uej8cgpfbrio3pea13cpsomldd4pma5l.apps.googleusercontent.com",
      scopes: [
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/drive.file"
      ]
    },
    "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkKO4/wD9UjTEZq93FRzbr6Gi19sLubB3v+Nn1/r6FOqeRWgTkvQGC5TqQISrTjVgMVwgFqG/uWzWO9K9ZVisVMTUT7cML/4QVuzoD+ovf/SWUoDWOE5ZzI9qB0JbvNvdHyKJpzWcNcjhPK7V8KmzEV7juKRbgT5Z8yRyrDrOJ5GGfnCYN8vm9X1posMl6mdj3XFFEAIp3aEbx1xeRkx5krtdJC+dE4tIRBXKqCn2XkQWwDf5FSiFJL+zdtQtzSX8Km84ejJu8mgz/m2ZBzjl32IV5ZmEmDQTcIYW3e3GTyFuNTD8NuPN7ZvCm6ZazI+c4XEb135c9nKgpol7Lq62zwIDAQAB",
  }
});


