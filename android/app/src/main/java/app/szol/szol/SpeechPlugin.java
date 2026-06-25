package app.szol.szol;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

@CapacitorPlugin(
    name = "Speech",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class SpeechPlugin extends Plugin {

    private SpeechRecognizer recognizer = null;
    private PluginCall       savedCall  = null;

    @PluginMethod
    public void startRecognition(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("Speech recognition not available");
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            savedCall = call;
            requestPermissionForAlias("microphone", call, "microphoneCallback");
            return;
        }
        startListening(call);
    }

    @PermissionCallback
    private void microphoneCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            startListening(call);
        } else {
            call.reject("Microphone permission denied");
        }
    }

    private void startListening(PluginCall call) {
        savedCall = call;
        call.setKeepAlive(true);

        String lang = call.getString("lang", "en-US");

        getActivity().runOnUiThread(() -> {
            if (recognizer != null) recognizer.destroy();
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(new RecognitionListener() {

                @Override
                public void onReadyForSpeech(Bundle params) {
                    JSObject d = new JSObject(); d.put("status", "ready");
                    notifyListeners("status", d);
                }

                @Override
                public void onPartialResults(Bundle partialResults) {
                    ArrayList<String> partial =
                        partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (partial != null && !partial.isEmpty()) {
                        JSObject d = new JSObject(); d.put("transcript", partial.get(0));
                        notifyListeners("partialResult", d);
                    }
                }

                @Override
                public void onResults(Bundle results) {
                    ArrayList<String> matches =
                        results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (savedCall != null && matches != null && !matches.isEmpty()) {
                        JSObject ret = new JSObject();
                        ret.put("transcript", matches.get(0));
                        savedCall.resolve(ret);
                        savedCall.setKeepAlive(false);
                        savedCall = null;
                    }
                    destroyRecognizer();
                }

                @Override
                public void onError(int error) {
                    if (savedCall != null) {
                        savedCall.reject("error:" + error);
                        savedCall.setKeepAlive(false);
                        savedCall = null;
                    }
                    destroyRecognizer();
                }

                @Override public void onBeginningOfSpeech() {}
                @Override public void onEndOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEvent(int eventType, Bundle params) {}
            });

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            recognizer.startListening(intent);
        });
    }

    @PluginMethod
    public void stopRecognition(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recognizer != null) recognizer.stopListening();
        });
        call.resolve();
    }

    private void destroyRecognizer() {
        getActivity().runOnUiThread(() -> {
            if (recognizer != null) { recognizer.destroy(); recognizer = null; }
        });
    }

    @Override
    protected void handleOnDestroy() { destroyRecognizer(); }
}
