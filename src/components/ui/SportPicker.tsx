import { SPORTS } from "../../lib/sports";
import OptionPicker from "./OptionPicker";

type Props = {
  value: string | null;
  onChange: (code: string) => void;
  error?: string | null;
};

// Fixed sport list; the server rejects anything outside it.
const SportPicker = ({ value, onChange, error }: Props) => (
  <OptionPicker
    label="Sport"
    placeholder="Pick a sport"
    options={SPORTS}
    value={value}
    onChange={onChange}
    error={error}
  />
);

export default SportPicker;
