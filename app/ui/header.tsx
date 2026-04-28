import React from "react";
import Image from "next/image";
const header = () => {
  return (
    <div>
      <Image
        src={"/perfume-oasis-logo.avif"}
        alt="logo"
        width={100}
        height={100}
      />
    </div>
  );
};

export default header;
