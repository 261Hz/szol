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

    private SpeechRecognizer recognizer   = null;
    private PluginCall       savedCall   = null;
    private StringBuilder    accumulated = new StringBuilder();
    private boolean          active      = false;

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
        accumulated.setLength(0);
        active = true;

        String lang = call.getString("lang", "en-US");

        getActivity().runOnUiThread(() -> {
            if (recognizer != null) recognizer.destroy();
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(buildListener(lang));
            startIntent(lang);
        });
    }

    private RecognitionListener buildListener(String lang) {
        return new RecognitionListener() {
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
                    String full = (accumulated.length() > 0 ? accumulated + " " : "") + partial.get(0);
                    JSObject d = new JSObject(); d.put("transcript", full);
                    notifyListeners("partialResult", d);
                }
            }

            @Override
            public void onResults(Bundle results) {
                ArrayList<String> matches =
                    results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches != null && !matches.isEmpty()) {
                    if (accumulated.length() > 0) accumulated.append(" ");
                    accumulated.append(matches.get(0));
                    JSObject d = new JSObject(); d.put("transcript", accumulated.toString());
                    notifyListeners("partialResult", d);
                }
                if (active) restartListening(lang);
            }

            @Override
            public void onError(int error) {
                if (!active) return;
                if (error == SpeechRecognizer.ERROR_NO_MATCH
                        || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                        || error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) {
                    restartListening(lang);
                } else {
                    if (savedCall != null) {
                        savedCall.reject("error:" + error);
                        savedCall.setKeepAlive(false);
                        savedCall = null;
                    }
                    destroyRecognizer();
                }
            }

            @Override public void onBeginningOfSpeech() {}
            @Override public void onEndOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEvent(int eventType, Bundle params) {}
        };
    }

    private void startIntent(String lang) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        recognizer.startListening(intent);
    }

    private void restartListening(String lang) {
        getActivity().runOnUiThread(() -> {
            if (recognizer != null) { recognizer.destroy(); recognizer = null; }
            if (!active) return;
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(buildListener(lang));
            startIntent(lang);
        });
    }

    @PluginMethod
    public void stopRecognition(PluginCall call) {
        active = false;
        getActivity().runOnUiThread(() -> {
            if (recognizer != null) recognizer.stopListening();
        });
        if (savedCall != null) {
            JSObject ret = new JSObject();
            ret.put("transcript", accumulated.toString().trim());
            savedCall.resolve(ret);
            savedCall.setKeepAlive(false);
            savedCall = null;
        }
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
