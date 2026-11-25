use crate::encoder::Mode;

const MINIMUM_BITRATE: u32 = 1_200_000;
const INITIAL_BITRATE: u32 = 4_000_000;
const HEADROOM: f64 = 0.9;

#[derive(Clone, Copy)]
pub struct Quality {
    pub height: u32,
    pub fps: u32,
    pub mode: Mode,
}

impl Quality {
    pub fn ceiling(self) -> u32 {
        let base: f64 = match self.height {
            0..=720 => 5_000_000.0,
            721..=1080 => 9_000_000.0,
            _ => 14_000_000.0,
        };
        let motion = match self.fps {
            0..=30 => 0.75,
            31..=60 => 1.0,
            _ => 1.35,
        };
        let effort = match self.mode {
            Mode::Performance => 0.67,
            Mode::Balanced => 1.0,
            Mode::Quality => 1.55,
            Mode::Extreme => 2.2,
        };
        (base * motion * effort) as u32
    }

    pub fn limits(self) -> (u32, u32, u32) {
        let maximum = (f64::from(self.ceiling()) / HEADROOM) as u32;
        (INITIAL_BITRATE.min(maximum), MINIMUM_BITRATE, maximum)
    }

    pub fn initial(self) -> u32 {
        self.limits().0
    }

    pub fn bitrate_for(self, estimate: u32) -> u32 {
        ((f64::from(estimate) * HEADROOM) as u32)
            .clamp(MINIMUM_BITRATE, self.ceiling().max(MINIMUM_BITRATE))
    }
}
