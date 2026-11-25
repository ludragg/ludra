use super::EncodedFrame;

const IDR: u8 = 5;
const SEQUENCE: u8 = 7;
const PICTURE: u8 = 8;

fn units(data: &[u8]) -> Vec<(usize, u8)> {
    (0..data.len().saturating_sub(3))
        .filter(|&at| data[at..at + 3] == [0, 0, 1])
        .map(|at| {
            let start = if at > 0 && data[at - 1] == 0 {
                at - 1
            } else {
                at
            };
            (start, data[at + 3] & 0x1f)
        })
        .collect()
}

pub fn complete(data: Vec<u8>, header: &mut Vec<u8>, timestamp_us: u64) -> EncodedFrame {
    let found = units(&data);
    let keyframe = found.iter().any(|&(_, kind)| kind == IDR);
    let carries_header = found.iter().any(|&(_, kind)| kind == SEQUENCE);
    if carries_header {
        *header = found
            .iter()
            .enumerate()
            .filter(|(_, (_, kind))| matches!(*kind, SEQUENCE | PICTURE))
            .flat_map(|(index, &(start, _))| {
                let end = found.get(index + 1).map_or(data.len(), |next| next.0);
                data[start..end].to_vec()
            })
            .collect();
    }
    let data = if keyframe && !carries_header && !header.is_empty() {
        [header.as_slice(), &data].concat()
    } else {
        data
    };
    EncodedFrame {
        data: data.into(),
        keyframe,
        timestamp_us,
    }
}
