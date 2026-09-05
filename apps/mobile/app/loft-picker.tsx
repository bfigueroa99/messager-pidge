import { realLoftPickerDeps } from '../src/data/loft-picker-deps';
import { LoftPicker } from '../src/ui/screens/LoftPicker';

export default function LoftPickerRoute() {
  return <LoftPicker deps={realLoftPickerDeps} />;
}
