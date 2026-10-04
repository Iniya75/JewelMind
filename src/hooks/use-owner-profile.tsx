import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getOwnerProfile } from "@/lib/api-service";

type OwnerContextType = {
  ownerName: string;
  shopName: string;
  email: string;
  gstin: string;
  city: string;
  phone: string;
  address: string;
  isNewUser: boolean;
  profileLoaded: boolean;
  refreshProfile: () => void;
};

const OwnerContext = createContext<OwnerContextType | undefined>(undefined);

export function OwnerProfileProvider({ children }: { children: ReactNode }) {
  const [ownerName, setOwnerName] = useState("Owner");
  const [shopName, setShopName] = useState("My Jewellery Shop");
  const [email, setEmail] = useState("");
  const [gstin, setGstin] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;

    // Check if user is logged in via localStorage token
    const token = localStorage.getItem("access_token");
    if (!token) {
      setProfileLoaded(true);
      return;
    }

    getOwnerProfile().then((profile) => {
      if (!active) return;
      if (profile && profile.ownerName) {
        setOwnerName(profile.ownerName);
        setShopName(profile.shopName);
        setEmail(profile.email || "");
        setGstin(profile.gstin || "");
        setCity(profile.city || "");
        setPhone(profile.phone || "");
        setAddress(profile.address || "");
        setIsNewUser(false);
      } else {
        setIsNewUser(true);
      }
      setProfileLoaded(true);
    }).catch(() => {
      if (!active) return;
      setIsNewUser(true);
      setProfileLoaded(true);
    });

    return () => { active = false; };
  }, [tick]);

  return (
    <OwnerContext.Provider value={{
      ownerName, shopName, email, gstin, city, phone, address,
      isNewUser, profileLoaded,
      refreshProfile: () => setTick(t => t + 1),
    }}>
      {children}
    </OwnerContext.Provider>
  );
}

export function useOwnerProfile() {
  const context = useContext(OwnerContext);
  if (context === undefined) {
    throw new Error("useOwnerProfile must be used within an OwnerProfileProvider");
  }
  return context;
}
