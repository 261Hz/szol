package app.szol.szol;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SpeechPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
