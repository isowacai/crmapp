interface AppConfig {
  environment: string;
  buildVersion: string;
}

interface Window {
  APP_CONFIG?: AppConfig;
}