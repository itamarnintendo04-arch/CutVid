// Fonts are bundled (not fetched from a CDN) so text looks the same offline, in the apps and in exports.
import '@fontsource/heebo/400.css';
import '@fontsource/heebo/700.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/700.css';
import '@fontsource/assistant/400.css';
import '@fontsource/assistant/700.css';
import '@fontsource/secular-one/400.css';
import '@fontsource/varela-round/400.css';
import '@fontsource/suez-one/400.css';
import '@fontsource/amatic-sc/400.css';
import '@fontsource/amatic-sc/700.css';
import '@fontsource/karantina/400.css';
import '@fontsource/karantina/700.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/700.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/oswald/400.css';
import '@fontsource/oswald/700.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/pacifico/400.css';
import '@fontsource/anton/400.css';
import '@fontsource/lobster/400.css';
import '@fontsource/permanent-marker/400.css';
import '@fontsource/roboto-mono/400.css';
import '@fontsource/roboto-mono/700.css';

export interface FontDef {
  name: string;
  css: string;
  hebrew?: boolean;
}

/** `css` is what gets stored on a text clip. */
export const FONTS: FontDef[] = [
  { name: 'Heebo', css: 'Heebo, Arial, sans-serif', hebrew: true },
  { name: 'Rubik', css: 'Rubik, Arial, sans-serif', hebrew: true },
  { name: 'Assistant', css: 'Assistant, Arial, sans-serif', hebrew: true },
  { name: 'Secular One', css: '"Secular One", Arial, sans-serif', hebrew: true },
  { name: 'Varela Round', css: '"Varela Round", Arial, sans-serif', hebrew: true },
  { name: 'Suez One', css: '"Suez One", Georgia, serif', hebrew: true },
  { name: 'Amatic SC', css: '"Amatic SC", cursive', hebrew: true },
  { name: 'Karantina', css: 'Karantina, Impact, sans-serif', hebrew: true },
  { name: 'Montserrat', css: 'Montserrat, Arial, sans-serif' },
  { name: 'Poppins', css: 'Poppins, Arial, sans-serif' },
  { name: 'Bebas Neue', css: '"Bebas Neue", Impact, sans-serif' },
  { name: 'Oswald', css: 'Oswald, Impact, sans-serif' },
  { name: 'Anton', css: 'Anton, Impact, sans-serif' },
  { name: 'Playfair Display', css: '"Playfair Display", Georgia, serif' },
  { name: 'Pacifico', css: 'Pacifico, cursive' },
  { name: 'Lobster', css: 'Lobster, cursive' },
  { name: 'Permanent Marker', css: '"Permanent Marker", cursive' },
  { name: 'Roboto Mono', css: '"Roboto Mono", "Courier New", monospace' },
  { name: 'Impact', css: 'Impact, "Arial Black", sans-serif' },
  { name: 'Georgia', css: 'Georgia, serif' },
  { name: 'Courier', css: '"Courier New", monospace' },
];
