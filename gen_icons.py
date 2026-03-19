import base64
import os

black_pixel_b64 = b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
icon_data = base64.b64decode(black_pixel_b64)

with open(r"c:\Users\Thiem\Documents\Codebase\scroller\icon-192.png", "wb") as f:
    f.write(icon_data)

with open(r"c:\Users\Thiem\Documents\Codebase\scroller\icon-512.png", "wb") as f:
    f.write(icon_data)

print("Icons generated successfully.")
