export default {
  expo: {
    name: "SuperAppEvos",
    slug: "SuperAppEvos",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/logo-app.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/logo-app.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.appfuturo.app",
      splash: {
        image: "./src/img-ref/background_login.svg",
        resizeMode: "cover",
        backgroundColor: "#ffffff"
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      edgeToEdgeEnabled: true,
      package: "com.appfuturo.app",
      splash: {
        image: "./src/img-ref/background_login.svg",
        resizeMode: "cover",
        backgroundColor: "#ffffff"
      }
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      [
        "expo-splash-screen",
        {
          image: "./src/img-ref/background_login.svg",
          imageWidth: 200,
          resizeMode: "cover",
          backgroundColor: "#ffffff"
        }
      ]
    ],
    extra: {
      eas: {
        projectId: "0855e7f0-a964-4eed-b3bd-4f3b2ba6f4a2"
      }
    }
  }
}; 