import hashlib
from datetime import datetime, timezone
from sqlmodel import Session, select
from database import engine, create_db_and_tables
from models import User, Incident, Station, Case, Evidence, DigitalEvidence, Suspect
import bcrypt

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def seed_data():
    print("Ensuring database and tables are created...")
    create_db_and_tables()

    with Session(engine) as session:

        # ── 1. Seed Stations ────────────────────────────────────────
        station_data = [
            {"name": "Ernakulam Central Police Station", "district": "Ernakulam",
             "address": "MG Road, Kochi, Ernakulam, Kerala 682001",
             "phone": "0484-2361234", "officer_in_charge": "Inspector Rajeev Kumar"},
            {"name": "Kozhikode Beach Police Station", "district": "Kozhikode",
             "address": "Beach Road, Kozhikode, Kerala 673001",
             "phone": "0495-2723456", "officer_in_charge": "Sub-Inspector Priya Ramesh"},
            {"name": "Thiruvananthapuram East Fort Station", "district": "Thiruvananthapuram",
             "address": "East Fort, Thiruvananthapuram, Kerala 695023",
             "phone": "0471-2471001", "officer_in_charge": "Head Constable Rajan"},
            {"name": "Thrissur Town Police Station", "district": "Thrissur",
             "address": "Town Hall Road, Thrissur, Kerala 680001",
             "phone": "0487-2422343"},
            {"name": "Kollam District Police HQ", "district": "Kollam",
             "address": "Police Headquarters, Kollam, Kerala 691001",
             "phone": "0474-2793001"},
            {"name": "Alappuzha North Police Station", "district": "Alappuzha",
             "address": "Boat Jetty Road, Alappuzha, Kerala 688001",
             "phone": "0477-2251234"},
        ]
        station_ids = {}
        for sd in station_data:
            existing_st = session.exec(select(Station).where(Station.name == sd["name"])).first()
            if not existing_st:
                st = Station(**sd)
                session.add(st)
                session.commit()
                session.refresh(st)
                station_ids[sd["district"]] = st.id
                print(f"Seeded station: {st.name} (ID: {st.id})")
            else:
                station_ids[sd["district"]] = existing_st.id

        ernakulam_station_id = station_ids.get("Ernakulam")

        # ── 2. Seed System Administrator ─────────────────────────────
        sysadmin_badge = "ADMIN-001"
        sysadmin = session.exec(select(User).where(User.badge_number == sysadmin_badge)).first()
        if not sysadmin:
            sysadmin = User(
                badge_number=sysadmin_badge,
                name="System Administrator",
                password_hash=get_password_hash("Admin@Sentinel2026"),
                role="Constable",
                station_id=ernakulam_station_id,
                is_admin=True,
                is_active=True,
                department="IT / Platform Administration",
                email="admin@sentinelpatrol.kp",
            )
            session.add(sysadmin)
            session.commit()
            print(f"Created System Administrator: {sysadmin.name} (Badge: {sysadmin_badge})")

        # ── 3. Seed Police Personnel ─────────────────────────────────
        user_definitions = [
            {"badge": "SI-001", "name": "Sub-Inspector Priya Ramesh", "role": "Sub-Inspector", "password": "password123", "district": "Kozhikode"},
            {"badge": "CONST-001", "name": "Constable Anish Nair", "role": "Constable", "password": "password123", "district": "Ernakulam"},
            {"badge": "SP-001", "name": "Superintendent Vikram Seth", "role": "Superintendent of Police", "password": "password123", "district": "Thrissur"},
            {"badge": "SO-001", "name": "Inspector Rajeev Kumar", "role": "Circle Inspector", "password": "password123", "district": "Ernakulam"},
            {"badge": "PC-101", "name": "Constable Anish Nair", "role": "Constable", "password": "password123", "district": "Ernakulam"},
            {"badge": "SI-102", "name": "Sub-Inspector Priya Ramesh", "role": "Sub-Inspector", "password": "password123", "district": "Kozhikode"},
            {"badge": "SP-103", "name": "Superintendent Vikram Seth", "role": "Superintendent of Police", "password": "password123", "district": "Thrissur"},
            {"badge": "DGP-104", "name": "DGP Madhavan Pillai", "role": "Director General of Police", "password": "password123", "district": "Ernakulam"},
            {"badge": "ASI-105", "name": "ASI Lakshmi Menon", "role": "Assistant Sub-Inspector", "password": "password123", "district": "Kozhikode"},
            {"badge": "HC-106", "name": "Head Constable Rajan", "role": "Head Constable", "password": "password123", "district": "Thiruvananthapuram"},
        ]
        
        user_objects = {}
        for u_data in user_definitions:
            usr = session.exec(select(User).where(User.badge_number == u_data["badge"])).first()
            pwd = u_data.get("password", "password123")
            if not usr:
                sid = station_ids.get(u_data["district"], ernakulam_station_id)
                usr = User(
                    badge_number=u_data["badge"],
                    name=u_data["name"],
                    password_hash=get_password_hash(pwd),
                    role=u_data["role"],
                    station_id=sid,
                    is_active=True,
                )
                session.add(usr)
                session.commit()
                session.refresh(usr)
                print(f"Seeded user: {usr.name} ({usr.role}, Badge: {usr.badge_number})")
            else:
                # Update password hash for existing accounts so login with password123 succeeds
                usr.password_hash = get_password_hash(pwd)
                session.add(usr)
                session.commit()
                print(f"Updated user credentials: {usr.name} (Badge: {usr.badge_number})")
            user_objects[u_data["badge"]] = usr

        si_user = user_objects.get("SI-001") or user_objects.get("SI-102") or user_objects["SO-001"]
        inspector_user = user_objects.get("SO-001")
        asi_user = user_objects.get("ASI-105") or user_objects["SO-001"]

        # ── 4. Seed Incidents ─────────────────────────────────────────
        existing_incidents = session.exec(select(Incident)).all()
        if len(existing_incidents) < 6:
            new_incidents = [
                Incident(
                    title="Traffic Congestion & Road Blockage",
                    description="Heavy container truck breakdown causing major blockage near MG Road, Kochi.",
                    latitude=9.9312, longitude=76.2673, district="Ernakulam",
                    status="Reported", reported_by=inspector_user.id
                ),
                Incident(
                    title="Unauthorized Beach Vendor Dispute",
                    description="Physical clash between unpermitted vendors on Kozhikode Beach walkway.",
                    latitude=11.2588, longitude=75.7804, district="Kozhikode",
                    status="Investigating", reported_by=si_user.id
                ),
                Incident(
                    title="Water Logging & Flood Hazard",
                    description="Severely flooded underpass near East Fort area, Thiruvananthapuram following heavy rains.",
                    latitude=8.5241, longitude=76.9366, district="Thiruvananthapuram",
                    status="Resolved", reported_by=inspector_user.id
                ),
                Incident(
                    title="Attempted Nighttime ATM Tampering",
                    description="Suspected burglary attempt at Mavoor Road ATM kiosk with heavy cutting tools.",
                    latitude=11.2543, longitude=75.7831, district="Kozhikode",
                    status="Investigating", reported_by=si_user.id
                ),
                Incident(
                    title="Cyber Phishing & Financial Fraud",
                    description="Multiple elderly victims reported unauthorized UPI drain from rogue banking calls in Kakkanad.",
                    latitude=10.0159, longitude=76.3419, district="Ernakulam",
                    status="Investigating", reported_by=inspector_user.id
                ),
                Incident(
                    title="Highway Collision near Swaraj Round",
                    description="Multi-vehicle pileup on Swaraj Round ring road involving a private bus and two cars.",
                    latitude=10.5276, longitude=76.2144, district="Thrissur",
                    status="Resolved", reported_by=asi_user.id
                ),
                Incident(
                    title="Houseboat Safety Violation & Overcrowding",
                    description="Unlicensed commercial boat carrying excess passengers near Punnamada Lake.",
                    latitude=9.4981, longitude=76.3388, district="Alappuzha",
                    status="Reported", reported_by=si_user.id
                )
            ]
            for inc in new_incidents:
                # Check title existing
                exists = session.exec(select(Incident).where(Incident.title == inc.title)).first()
                if not exists:
                    session.add(inc)
            session.commit()
            print("Seeded additional incident records.")

        all_incidents = session.exec(select(Incident)).all()
        inc_dict = {i.title: i.id for i in all_incidents}

        # ── 5. Seed Cases ─────────────────────────────────────────────
        existing_cases = session.exec(select(Case)).all()
        if len(existing_cases) < 4:
            cases_data = [
                {
                    "title": "State vs. Mavoor ATM Burglary Syndicate",
                    "description": "Comprehensive investigation into organized gang attempting night burglaries across Kozhikode district kiosks.",
                    "status": "Under Investigation",
                    "incident_id": inc_dict.get("Attempted Nighttime ATM Tampering", all_incidents[0].id),
                    "assigned_officer_id": si_user.id
                },
                {
                    "title": "Kakkanad Cyber Phishing Fraud Case #402",
                    "description": "Financial cybercrime investigation tracking unauthorized bank transfers and SIM-swapping networks.",
                    "status": "Under Investigation",
                    "incident_id": inc_dict.get("Cyber Phishing & Financial Fraud", all_incidents[0].id),
                    "assigned_officer_id": inspector_user.id
                },
                {
                    "title": "Kozhikode Beach Altercation & Rioting Case",
                    "description": "Case registered regarding public disturbance and assault near beach promenade.",
                    "status": "Open",
                    "incident_id": inc_dict.get("Unauthorized Beach Vendor Dispute", all_incidents[0].id),
                    "assigned_officer_id": si_user.id
                },
                {
                    "title": "Swaraj Round Traffic Negligence Inquiry",
                    "description": "Traffic safety crash investigation evaluating driver sobriety and speed telemetry.",
                    "status": "Closed",
                    "incident_id": inc_dict.get("Highway Collision near Swaraj Round", all_incidents[0].id),
                    "assigned_officer_id": asi_user.id
                }
            ]
            for cd in cases_data:
                exists = session.exec(select(Case).where(Case.title == cd["title"])).first()
                if not exists:
                    c = Case(**cd)
                    session.add(c)
            session.commit()
            print("Seeded case records.")

        all_cases = session.exec(select(Case)).all()
        case_dict = {c.title: c.id for c in all_cases}

        # ── 6. Seed Textual Evidence ──────────────────────────────────
        existing_evidence = session.exec(select(Evidence)).all()
        if len(existing_evidence) < 5:
            ev_data = [
                {
                    "case_id": all_cases[0].id,
                    "description": "Recovered heavy hydraulic cutter and mask dropped at Mavoor Road ATM premises.",
                    "evidence_type": "Physical",
                    "collected_by": si_user.id
                },
                {
                    "case_id": all_cases[0].id,
                    "description": "Security guard eyewitness statement corroborating two male suspects fleeing on an unnumbered motorcycle.",
                    "evidence_type": "Testimonial",
                    "collected_by": si_user.id
                },
                {
                    "case_id": all_cases[1].id if len(all_cases) > 1 else all_cases[0].id,
                    "description": "IP call detail record (CDR) log showing spoofed VoIP origin originating from interstate server.",
                    "evidence_type": "Digital",
                    "collected_by": inspector_user.id
                },
                {
                    "case_id": all_cases[1].id if len(all_cases) > 1 else all_cases[0].id,
                    "description": "Bank account statement showing ₹4.8 Lakh transferred across 3 fraudulent gateway accounts.",
                    "evidence_type": "Document",
                    "collected_by": inspector_user.id
                },
                {
                    "case_id": all_cases[2].id if len(all_cases) > 2 else all_cases[0].id,
                    "description": "Broken metal rod used during beach vendor altercation recovered from site.",
                    "evidence_type": "Physical",
                    "collected_by": si_user.id
                }
            ]
            for ed in ev_data:
                session.add(Evidence(**ed))
            session.commit()
            print("Seeded textual evidence items.")

        # ── 7. Seed Digital Evidence (Files with SHA-256 Hashes) ─────
        existing_digital = session.exec(select(DigitalEvidence)).all()
        if len(existing_digital) < 4:
            digital_data = [
                {
                    "case_id": all_cases[0].id,
                    "original_filename": "atm_cam4_1120pm_burg.mp4",
                    "stored_filename": "fe2910ab481e4a7791a82bc87e92384a.mp4",
                    "file_size_bytes": 48291024,
                    "mime_type": "video/mp4",
                    "category": "Video",
                    "description": "High-resolution 1080p CCTV footage of suspect attempting door lock break.",
                    "hash_sha256": hashlib.sha256(b"atm_cam4_sample_video_bytes").hexdigest(),
                    "uploaded_by": si_user.id,
                    "is_sensitive": True
                },
                {
                    "case_id": all_cases[0].id,
                    "original_filename": "crime_scene_atm_front.jpg",
                    "stored_filename": "c98319a2b8471e98a1239ab7821034fe.jpg",
                    "file_size_bytes": 3942010,
                    "mime_type": "image/jpeg",
                    "category": "Photo",
                    "description": "Forensic close-up photo of damaged shutter lock mechanism.",
                    "hash_sha256": hashlib.sha256(b"photo_shutter_damage_sample").hexdigest(),
                    "uploaded_by": si_user.id,
                    "is_sensitive": False
                },
                {
                    "case_id": all_cases[1].id if len(all_cases) > 1 else all_cases[0].id,
                    "original_filename": "cyber_forensics_pcap_dump.pcap",
                    "stored_filename": "82a93710bc441e827103a91029482b12.pcap",
                    "file_size_bytes": 12048910,
                    "mime_type": "text/plain",
                    "category": "Document",
                    "description": "Network packet dump captured from target banking phishing domain.",
                    "hash_sha256": hashlib.sha256(b"pcap_dump_network_bytes").hexdigest(),
                    "uploaded_by": inspector_user.id,
                    "is_sensitive": True
                },
                {
                    "case_id": all_cases[2].id if len(all_cases) > 2 else all_cases[0].id,
                    "original_filename": "eyewitness_audio_statement.mp3",
                    "stored_filename": "d38a0192bc9381729012389a0129bc81.mp3",
                    "file_size_bytes": 5819024,
                    "mime_type": "audio/mpeg",
                    "category": "Audio",
                    "description": "Audio recording of local shopkeeper describing the altercation onset.",
                    "hash_sha256": hashlib.sha256(b"audio_recording_sample").hexdigest(),
                    "uploaded_by": si_user.id,
                    "is_sensitive": False
                }
            ]
            for dd in digital_data:
                session.add(DigitalEvidence(**dd))
            session.commit()
            print("Seeded digital evidence items.")

        # ── 8. Seed Suspects / Criminals ──────────────────────────────
        existing_suspects = session.exec(select(Suspect)).all()
        if len(existing_suspects) < 3:
            suspects_data = [
                {
                    "full_name": "Faisal 'Blade' Rahman",
                    "alias": "Blade Faisal",
                    "date_of_birth": datetime(1994, 6, 15, tzinfo=timezone.utc),
                    "gender": "Male",
                    "nationality": "Indian",
                    "aadhaar_number": "7849-2019-4821",
                    "phone": "9847102938",
                    "address": "Kallai Road, Kozhikode, Kerala 673003",
                    "district": "Kozhikode",
                    "category": "Wanted",
                    "criminal_history": "3 prior charges for night burglary and shop breaking (2021, 2023).",
                    "physical_description": "5ft 10in, scar on left cheek, tattoo of anchor on right forearm.",
                    "is_wanted": True,
                    "is_arrested": False,
                    "registered_by": si_user.id,
                    "linked_case_ids": str(all_cases[0].id)
                },
                {
                    "full_name": "Siddharth Verma",
                    "alias": "Sid Cyber",
                    "date_of_birth": datetime(1998, 11, 3, tzinfo=timezone.utc),
                    "gender": "Male",
                    "nationality": "Indian",
                    "aadhaar_number": "3910-4829-1092",
                    "phone": "9447192837",
                    "address": "Vyttila, Kochi, Ernakulam, Kerala 682019",
                    "district": "Ernakulam",
                    "category": "Suspect",
                    "criminal_history": "Suspected mule account provider for interstate phishing racket.",
                    "physical_description": "5ft 7in, spectacles, slim build.",
                    "is_wanted": False,
                    "is_arrested": True,
                    "registered_by": inspector_user.id,
                    "linked_case_ids": str(all_cases[1].id) if len(all_cases) > 1 else str(all_cases[0].id)
                },
                {
                    "full_name": "Ramesh 'Thunder' Varma",
                    "alias": "Thunder Ramesh",
                    "date_of_birth": datetime(1989, 4, 22, tzinfo=timezone.utc),
                    "gender": "Male",
                    "nationality": "Indian",
                    "aadhaar_number": "9102-4819-3019",
                    "phone": "9745102938",
                    "address": "Beach Walkway, Kozhikode, Kerala 673001",
                    "district": "Kozhikode",
                    "category": "Criminal",
                    "criminal_history": "Convicted for extortion and public assault (2022).",
                    "physical_description": "6ft 0in, heavy build, black beard.",
                    "is_wanted": False,
                    "is_arrested": True,
                    "registered_by": si_user.id,
                    "linked_case_ids": str(all_cases[2].id) if len(all_cases) > 2 else str(all_cases[0].id)
                }
            ]
            for sd in suspects_data:
                session.add(Suspect(**sd))
            session.commit()
            print("Seeded suspect records.")

    print("Database seeding completed successfully.")

if __name__ == "__main__":
    seed_data()
