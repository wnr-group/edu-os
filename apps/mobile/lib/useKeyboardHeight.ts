import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

// Tracks the on-screen keyboard height. Used to pad bottom-sheet Modals,
// since RN's Modal renders in its own Android window that ignores the
// activity's adjustResize, so neither native resize nor KeyboardAvoidingView
// reliably lifts the content above the keyboard.
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
