package app.ziptalks.android;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

/**
 * ZipTalk MainActivity:
 * 1. Creates a notification channel so FCM notifications appear in the OS tray.
 * 2. Clears fullscreen layout flags so content doesn't hide behind the status bar.
 */
public class MainActivity extends BridgeActivity {
    private static final String CHANNEL_MESSAGES = "maddychats-messages";
    private static final String CHANNEL_NAME = "Messages";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannels();
        fixStatusBarOverlap();
    }

    /** Android 8+ requires a notification channel for every visible notification. */
    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_MESSAGES,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("New messages from your conversations");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 200, 100, 200});

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    /** Ensure WebView content stops at the status bar boundary. */
    private void fixStatusBarOverlap() {
        Window window = getWindow();

        window.clearFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(0xFF0B1211);
        window.setNavigationBarColor(0xFF0B1211);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            View decor = window.getDecorView();
            int flags = decor.getSystemUiVisibility();
            flags &= ~(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                     |  View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                     |  View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
            decor.setSystemUiVisibility(flags);
        }
    }
}
