import java.util.Properties

plugins {
    id("com.android.application")
}

// 签名配置放在 signing/keystore.properties（不入库）；文件不存在时回退到 debug 签名，
// 这样任何人 clone 下来不用证书也能 assembleDebug。
val signingPropsFile = rootProject.file("signing/keystore.properties")
val signingProps = Properties().apply {
    if (signingPropsFile.exists()) signingPropsFile.inputStream().use { load(it) }
}
val hasReleaseSigning = signingPropsFile.exists() && signingProps.getProperty("storeFile") != null

android {
    namespace = "com.studydeck.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.studydeck.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 14
        versionName = "0.8.5"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(signingProps.getProperty("storeFile"))
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword")
                enableV1Signing = true
                enableV2Signing = true
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (hasReleaseSigning) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = false
    }
}
