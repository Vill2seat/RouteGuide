import { registerRootComponent } from 'expo';
import React from 'react';
import { SQLiteDB } from './services/database';

import App from './app/_layout';

registerRootComponent(App);

// Initialize database on app start
SQLiteDB.init().catch(console.error);