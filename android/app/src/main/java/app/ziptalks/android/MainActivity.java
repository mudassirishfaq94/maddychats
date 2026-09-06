package app.ziptalks.android;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

/**
 * ZipTalk MainActivity — ensures content never extends behind the status bar.
 *
 * The hosted web app uses viewport-fit=cover which tells the browser engine
 * to lay out behind system bars.  In a Capacitor WebView this causes content
 * to be hidden behind the status bar.  We clear the fullscreen layout flags
 * so the WebView content stops at the status bar boundary.
 */
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();

        // Clear any layout-no-limits flag (API 30+)
        window.clearFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS);

        // Set opaque system bars with ZipTalk dark color
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(0xFF0B1211);
        window.setNavigationBarColor(0xFF0B1211);

        // Pre-API 30: clear system-ui layout flags on the decor view
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
