package com.assidcenter.teacher;

import android.graphics.Color;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // خلفيّة WebView الافتراضيّة بيضاء إلى أن يُرسَم أوّل إطار من الصفحة —
    // نضبطها هنا صراحةً لتطابق لون العلامة فورًا (طبقة حماية إضافيّة فوق
    // android:windowBackground في styles.xml وbackgroundColor في
    // capacitor.config.ts)، فيختفي أيّ وميض أبيض عند إقلاع التطبيق.
    if (getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().setBackgroundColor(Color.parseColor("#0F6B3F"));
    }
  }
}
